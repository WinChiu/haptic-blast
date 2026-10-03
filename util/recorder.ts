// Sensor recordings of a journey, for working out how well the phone's heading
// and the GPS direction of travel agree (see "Hands-free and eyes-free use" in
// the README). Pure functions only, so they can be tested on a computer.

export type Sample = {
  t: number; // milliseconds since the recording started
  lat: number;
  lng: number;
  accuracy: number | null; // GPS accuracy, metres
  speed: number | null; // metres per second
  course: number | null; // GPS direction of travel, degrees from north
  phoneHeading: number; // where the phone points (what the app uses today)
  targetBearing: number | null; // direction the guidance is steering towards
  checkpoint: number | null; // index of the current checkpoint
};

export type Recording = {
  meta: Record<string, string>;
  samples: Sample[];
};

export const CSV_COLUMNS =
  't_ms,lat,lng,accuracy_m,speed_mps,course_deg,phone_heading_deg,target_bearing_deg,checkpoint';

const RECORDING_MARKER = '# haptic-blast recording v1';

const num = (v: number | null, digits: number) =>
  v === null || Number.isNaN(v) ? '' : v.toFixed(digits);

export function toCsv(recording: Recording): string {
  const lines = [RECORDING_MARKER];
  for (const [key, value] of Object.entries(recording.meta)) {
    lines.push(`# ${key}=${value}`);
  }
  lines.push(CSV_COLUMNS);
  for (const s of recording.samples) {
    lines.push(
      [
        Math.round(s.t),
        s.lat.toFixed(6),
        s.lng.toFixed(6),
        num(s.accuracy, 1),
        num(s.speed, 2),
        num(s.course, 1),
        num(s.phoneHeading, 1),
        num(s.targetBearing, 1),
        s.checkpoint === null ? '' : s.checkpoint,
      ].join(',')
    );
  }
  return lines.join('\n');
}

// Reads one or several recordings written by toCsv (concatenated or not)
export function parseCsv(text: string): Recording[] {
  const recordings: Recording[] = [];
  let current: Recording | null = null;
  const orNull = (v: string) => (v === '' ? null : Number(v));

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line === RECORDING_MARKER) {
      current = { meta: {}, samples: [] };
      recordings.push(current);
    } else if (line.startsWith('#') && current) {
      const eq = line.indexOf('=');
      if (eq > 0) current.meta[line.slice(2, eq)] = line.slice(eq + 1);
    } else if (current && !line.startsWith('t_ms')) {
      const f = line.split(',');
      if (f.length < 9) continue;
      current.samples.push({
        t: Number(f[0]),
        lat: Number(f[1]),
        lng: Number(f[2]),
        accuracy: orNull(f[3]),
        speed: orNull(f[4]),
        course: orNull(f[5]),
        phoneHeading: Number(f[6]),
        targetBearing: orNull(f[7]),
        checkpoint: orNull(f[8]),
      });
    }
  }
  return recordings;
}

// Signed difference a - b in degrees, in (-180, 180]
export function circularDiff(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

// Mean direction of angles in degrees, plus how tightly they cluster
// (r near 1 = all the same, near 0 = scattered) and the circular spread.
export function circularStats(angles: number[]): {
  mean: number;
  r: number;
  stdDev: number;
} {
  if (angles.length === 0) return { mean: NaN, r: NaN, stdDev: NaN };
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos((a * Math.PI) / 180);
    sy += Math.sin((a * Math.PI) / 180);
  }
  const r = Math.hypot(sx, sy) / angles.length;
  const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const stdDev = r > 0 ? (Math.sqrt(-2 * Math.log(r)) * 180) / Math.PI : 180;
  return { mean: circularDiff(mean, 0), r, stdDev };
}

export type HeadingSummary = {
  samples: number;
  walking: number; // samples with a usable GPS direction at walking speed
  // course - phoneHeading: how far the phone's heading is from the way the
  // person is actually moving. A small, steady spread means the phone's
  // heading can be corrected with a fixed offset; a large one means it cannot.
  offsetMean: number;
  offsetStdDev: number;
  // Share of walking samples where the direction of travel was within
  // `tolerance` degrees of the guidance target (could GPS direction alone
  // have steered the person?)
  courseWithinToleranceOfTarget: number;
  // Same question for the phone's heading
  phoneWithinToleranceOfTarget: number;
};

export function summariseHeading(
  samples: Sample[],
  options: { minSpeed?: number; tolerance?: number } = {}
): HeadingSummary {
  const minSpeed = options.minSpeed ?? 1.0; // m/s, a slow walk
  const tolerance = options.tolerance ?? 25;
  const walking = samples.filter(
    (s) => s.course !== null && s.speed !== null && s.speed >= minSpeed
  );
  const offsets = walking.map((s) => circularDiff(s.course!, s.phoneHeading));
  const stats = circularStats(offsets);

  const withTarget = walking.filter((s) => s.targetBearing !== null);
  const share = (hit: (s: Sample) => boolean) =>
    withTarget.length === 0
      ? NaN
      : withTarget.filter(hit).length / withTarget.length;

  return {
    samples: samples.length,
    walking: walking.length,
    offsetMean: stats.mean,
    offsetStdDev: stats.stdDev,
    courseWithinToleranceOfTarget: share(
      (s) => Math.abs(circularDiff(s.targetBearing!, s.course!)) <= tolerance
    ),
    phoneWithinToleranceOfTarget: share(
      (s) => Math.abs(circularDiff(s.targetBearing!, s.phoneHeading)) <= tolerance
    ),
  };
}
