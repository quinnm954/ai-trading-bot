#!/usr/bin/env python3
"""Bespoke 15s cinematic music bed for the TitanAI paid-ads cut.

Structure is locked to the edit's cut points (0.0 / 2.6 / 7.2 / 11.4 / 15.0s):
  - hook (0.0-2.6):    sub pulse + hushed pad, filtered dark
  - system (2.6-7.2):  pad opens, 8th-note arp enters, driving pulse
  - rules (7.2-11.4):  arp doubles, bass moves, tension chord
  - cta (11.4-15.0):   riser lands on a downbeat hit, full chord resolves out
Downbeat impacts sit exactly on every cut. Output: public/audio/ads-bed-15.mp3
"""
import numpy as np
import subprocess
import os

SR = 48000
DUR = 15.0
CUTS = [0.0, 2.6, 7.2, 11.4]
END = 15.0
BPM = 120.0
BEAT = 60.0 / BPM

n = int(SR * DUR)
t = np.arange(n) / SR
left = np.zeros(n)
right = np.zeros(n)


def idx(sec):
    return int(sec * SR)


def add(buf, start, sig):
    i = idx(start)
    if i >= len(buf):
        return
    end = min(len(buf), i + len(sig))
    buf[i:end] += sig[: end - i]


def env_ad(length, attack, decay, curve=2.5):
    e = np.ones(length)
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    e[:a] = np.linspace(0, 1, a) ** 1.4
    tail = np.linspace(0, 1, min(d, length))
    e[-len(tail):] = (1 - tail) ** curve
    return e


def onepole_lp(x, cutoff):
    """cutoff may be scalar or per-sample array (Hz)."""
    c = np.asarray(cutoff, dtype=float)
    if c.ndim == 0:
        c = np.full(len(x), float(c))
    a = 1.0 - np.exp(-2.0 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def tone(freq, length_s, kind="sine", detune=0.0):
    ln = int(length_s * SR)
    tt = np.arange(ln) / SR
    f = freq * (1 + detune)
    if kind == "saw":
        # bandlimited-ish saw from a few harmonics
        s = np.zeros(ln)
        for h in range(1, 9):
            s += np.sin(2 * np.pi * f * h * tt) / h
        return s / 2.2
    if kind == "tri":
        return 2 * np.abs(2 * ((f * tt) % 1) - 1) - 1
    return np.sin(2 * np.pi * f * tt)


# ── harmony: A minor -> F -> C (cinematic, resolves up) ───────────────────────
NOTE = {"A1": 55.0, "E2": 82.41, "A2": 110.0, "C3": 130.81, "E3": 164.81,
        "F2": 87.31, "F3": 174.61, "A3": 220.0, "C4": 261.63, "G2": 98.0,
        "G3": 196.0, "D3": 146.83, "E4": 329.63}

SECTIONS = [
    # start, end, chord (pad voices), bass note
    (0.0, 2.6, ["A2", "E3", "C3"], "A1"),
    (2.6, 7.2, ["A2", "E3", "C4"], "A1"),
    (7.2, 11.4, ["F2", "C4", "A3"], "F2"),
    (11.4, 15.0, ["C3", "G3", "E4"], "G2"),
]

# ── pads (sustained, filter opens through the piece) ─────────────────────────
for s_start, s_end, chord, _bass in SECTIONS:
    ln = s_end - s_start
    for vi, note in enumerate(chord):
        f = NOTE[note]
        sig = (
            tone(f, ln, "saw")
            + 0.6 * tone(f, ln, "saw", detune=0.004)
            + 0.4 * tone(f * 2, ln, "sine")
        )
        e = env_ad(len(sig), 0.35, 0.5, curve=1.6)
        # filter opens as the ad progresses
        openness = np.linspace(s_start / END, s_end / END, len(sig))
        cutoff = 420 + 2600 * openness
        sig = onepole_lp(sig * e, cutoff)
        gain = 0.085 if s_start == 0.0 else 0.125
        pan = -0.35 + 0.35 * vi
        add(left, s_start, sig * gain * (1 - max(0.0, pan)))
        add(right, s_start, sig * gain * (1 + min(0.0, pan)))

# ── sub bass pulse: quarter notes, harder once the product enters ────────────
k = 0
while k * BEAT < END - 0.05:
    ts = k * BEAT
    sec = next(s for s in SECTIONS if s[0] <= ts < s[1])
    bass = NOTE[sec[3]]
    strong = ts >= 2.6
    ln = 0.42 if strong else 0.55
    sig = tone(bass, ln, "sine") + 0.35 * tone(bass * 2, ln, "sine")
    sig *= env_ad(len(sig), 0.006, ln * 0.92, curve=2.2)
    g = 0.30 if strong else 0.17
    if ts >= 11.4:
        g = 0.34
    add(left, ts, sig * g)
    add(right, ts, sig * g)
    k += 1

# ── arp: 8th notes from the product beat, doubles in the rules section ───────
def arp_note(freq, ln):
    sig = tone(freq, ln, "tri") * 0.7 + tone(freq * 2, ln, "sine") * 0.25
    click = np.random.default_rng(int(freq)).normal(0, 1, int(0.008 * SR)) * 0.25
    sig[: len(click)] += click
    sig *= env_ad(len(sig), 0.004, ln * 0.95, curve=3.2)
    return onepole_lp(sig, 3800)


arp_seq = ["A3", "C4", "E4", "C4"]
step = BEAT / 2
ts = 2.6
i = 0
while ts < END - 0.2:
    fast = ts >= 7.2
    sec = next(s for s in SECTIONS if s[0] <= ts < s[1])
    # follow the chord: pick from the section's upper voices
    pool = [v for v in sec[2] if NOTE[v] > 120] or sec[2]
    note = pool[i % len(pool)]
    ln = step * (0.8 if fast else 0.95)
    sig = arp_note(NOTE[note], ln)
    g = 0.09 if not fast else 0.115
    if ts >= 11.4:
        g = 0.10
    pan = 0.25 if i % 2 else -0.25
    add(left, ts, sig * g * (1 - max(0.0, pan)))
    add(right, ts, sig * g * (1 + min(0.0, pan)))
    ts += step if fast else step * 2
    i += 1

# ── downbeat impacts on every cut ───────────────────────────────────────────
rng = np.random.default_rng(7)
for ci, c in enumerate(CUTS):
    ln = 1.5
    boom = tone(48, ln, "sine") * np.exp(-np.linspace(0, 9, int(ln * SR)))
    drop = np.sin(2 * np.pi * np.cumsum(np.linspace(120, 34, int(ln * SR))) / SR)
    drop *= np.exp(-np.linspace(0, 7, int(ln * SR)))
    noise = rng.normal(0, 1, int(0.45 * SR))
    noise = onepole_lp(noise, 1800) * np.exp(-np.linspace(0, 12, len(noise)))
    g = 0.5 if ci else 0.34
    sig = boom * 0.75 * g + drop * 0.5 * g
    add(left, c, sig)
    add(right, c, sig)
    add(left, c, noise * 0.16 * g)
    add(right, c, noise * 0.16 * g)

# ── riser into the CTA ──────────────────────────────────────────────────────
r_start, r_len = 9.9, 1.5
rl = int(r_len * SR)
sweep_f = np.linspace(180, 1500, rl)
riser = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR) * 0.5
hiss = rng.normal(0, 1, rl)
hiss = onepole_lp(hiss, np.linspace(600, 7000, rl)) * 0.9
ramp = np.linspace(0, 1, rl) ** 2.2
riser = (riser + hiss) * ramp * 0.14
add(left, r_start, riser)
add(right, r_start, riser)

# reverse-swell into the very first frame
pre = int(0.55 * SR)
swell = onepole_lp(rng.normal(0, 1, pre), np.linspace(400, 2600, pre))
swell *= np.linspace(0, 1, pre) ** 2.6 * 0.1
left[:pre] += swell
right[:pre] += swell

# ── final resolve: chord swell that lands on the last frame ─────────────────
res_start = 13.5
ln = END - res_start
for note in ["C3", "G3", "E4", "C4"]:
    sig = tone(NOTE[note], ln, "saw") * 0.5 + tone(NOTE[note] * 2, ln, "sine") * 0.2
    sig *= np.linspace(0.35, 1.0, len(sig)) ** 1.1
    sig = onepole_lp(sig, np.linspace(1200, 4200, len(sig)))
    add(left, res_start, sig * 0.075)
    add(right, res_start, sig * 0.075)

# ── master: gentle saturation, fade edges, normalize ────────────────────────
mix = np.stack([left, right], axis=1)
mix = np.tanh(mix * 1.25) / 1.25
fade_in = int(0.05 * SR)
fade_out = int(0.32 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= (np.linspace(1, 0, fade_out) ** 1.6)[:, None]
peak = np.max(np.abs(mix))
mix = mix / peak * 0.92

out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
os.makedirs(out_dir, exist_ok=True)
wav_path = os.path.join(out_dir, "ads-bed-15.wav")
mp3_path = os.path.join(out_dir, "ads-bed-15.mp3")

pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
import wave

with wave.open(wav_path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame",
     "-b:a", "256k", mp3_path],
    check=True,
)
os.remove(wav_path)
print("wrote", mp3_path)
