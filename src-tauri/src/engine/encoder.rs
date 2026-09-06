//! Encoder de vídeo H.264 nativo (OpenH264) com pipeline RGB → I420 → NALs.
//!
//! Roda fora do WebView: recebe frames BGRX da captura, converte para I420 e
//! devolve frames H.264 prontos para o packetizador do TrackLocalStaticSample.

use anyhow::{anyhow, Result};
use openh264::formats::YUVBuffer;
use openh264::encoder::{Encoder, EncoderConfig};
use std::collections::VecDeque;

pub struct H264Encoder {
    encoder: Encoder,
    width: u32,
    height: u32,
    yuv: YUVBuffer,
    /// Fila de NALs do último frame codificado.
    out: VecDeque<Vec<u8>>,
    /// Contador de frames para forçar keyframe periódico (recuperação de viewers).
    frame_count: u64,
    keyframe_interval: u64,
}

impl H264Encoder {
    /// Cria o encoder para uma resolução-alvo. Se a captura for maior que
    /// `max_width`, faz downscale (1080p/60fps é o alvo do Discord-like).
    pub fn new(width: u32, height: u32, fps: u32, max_width: u32) -> Result<Self> {
        let (w, h) = scale_to(width, height, max_width);
        let config = EncoderConfig::new()
            .max_frame_rate(fps.max(1) as u32)
            .bitrate(6_000_000) // 6 Mbps — qualidade de gamescreen em 1080p
            .num_threads(0)     // auto
            .skip_frames(false);
        let encoder = Encoder::with_api_config(openh264::OpenH264API::from_source(), config)
            .map_err(|e| anyhow!("falha ao inicializar OpenH264: {e}"))?;
        Ok(Self {
            encoder,
            width: w,
            height: h,
            yuv: YUVBuffer::with_size(w as usize, h as usize),
            out: VecDeque::new(),
            frame_count: 0,
            keyframe_interval: 60, // keyframe a cada ~1s @60fps
        })
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    /// Encoda um frame BGRX (4 bytes/pixel) e devolve os NALs H.264 (Annex B).
    pub fn encode_bgrx(&mut self, w: u32, h: u32, data: &[u8]) -> Result<Vec<Vec<u8>>> {
        if w == 0 || h == 0 || data.len() < (w * h * 4) as usize {
            return Ok(vec![]);
        }

        // Resolução mudou? Recria o encoder (o OpenH264 exige dims fixas por sessão).
        if w != self.width || h != self.height {
            let fps = 60;
            let config = EncoderConfig::new()
                .max_frame_rate(fps)
                .bitrate(6_000_000)
                .num_threads(0)
                .skip_frames(false);
            self.encoder = Encoder::with_api_config(openh264::OpenH264API::from_source(), config)
                .map_err(|e| anyhow!("falha ao reinicializar encoder: {e}"))?;
            self.width = w;
            self.height = h;
            self.yuv = YUVBuffer::with_size(w as usize, h as usize);
        }

        self.yuv.set_dimensions(w as usize, h as usize);
        convert_bgrx_to_i420(w, h, data, &mut self.yuv);

        let bitstream = self
            .encoder
            .encode(&self.yuv)
            .map_err(|e| anyhow!("erro de encode: {e}"))?;

        self.frame_count += 1;
        let mut nals = Vec::new();
        for unit in bitstream.iter() {
            let payload: &[u8] = unit.payload();
            if !payload.is_empty() {
                nals.push(payload.to_vec());
            }
        }
        Ok(nals)
    }

    /// Força keyframe no próximo frame (usado quando um novo viewer entra).
    pub fn request_keyframe(&mut self) {
        self.encoder.force_intra_frame(true);
    }

    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }
}

/// Calcula dimensões escaladas para caber em `max_width` mantendo aspect ratio,
/// com dimensões pares (requisito do H.264 para chroma 4:2:0).
pub fn scale_to(w: u32, h: u32, max_width: u32) -> (u32, u32) {
    let (mut w, mut h) = (w.max(2), h.max(2));
    if max_width > 0 && w > max_width {
        let ratio = max_width as f64 / w as f64;
        w = max_width;
        h = (h as f64 * ratio).round() as u32;
    }
    // Dimensões pares para chroma 4:2:0
    ((w - (w % 2)).max(2), (h - (h % 2)).max(2))
}

/// Conversão BGRX → I420 direto no buffer do YUVBuffer (sem crates extras).
fn convert_bgrx_to_i420(w: u32, h: u32, bgrx: &[u8], yuv: &mut YUVBuffer) {
    let (y_plane, u_plane, v_plane) = yuv.planes_mut();
    let stride = w as usize;
    let cw = (w / 2) as usize;
    for row in 0..h as usize {
        let y_row = &mut y_plane[row * stride..row * stride + stride];
        let src_row = row * stride * 4;
        for col in 0..w as usize {
            let b = bgrx[src_row + col * 4] as i32;
            let g = bgrx[src_row + col * 4 + 1] as i32;
            let r = bgrx[src_row + col * 4 + 2] as i32;
            // BT.601 limited range (padrão de vídeo)
            let y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
            y_row[col] = y.clamp(16, 235) as u8;

            if row % 2 == 0 && col % 2 == 0 {
                let b2 = bgrx[src_row + (col + 1).min(w as usize - 1) * 4] as i32;
                let g2 = bgrx[src_row + (col + 1).min(w as usize - 1) * 4 + 1] as i32;
                let r2 = bgrx[src_row + (col + 1).min(w as usize - 1) * 4 + 2] as i32;
                let ravg = (r + r2) / 2;
                let gavg = (g + g2) / 2;
                let bavg = (b + b2) / 2;
                let u = ((-38 * ravg - 74 * gavg + 112 * bavg + 128) >> 8) + 128;
                let v = ((112 * ravg - 94 * gavg - 18 * bavg + 128) >> 8) + 128;
                let (urow, vrow) = (row / 2, col / 2);
                u_plane[urow * cw + vrow] = u.clamp(16, 240) as u8;
                v_plane[urow * cw + vrow] = v.clamp(16, 240) as u8;
            }
        }
    }
}

#[allow(unused_imports)]
use FrameType as _FrameTypeMarker; // reexportado p/ documentação
