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
  zone?: number | null; // the silent zone in force, degrees (wider when GPS is poor)
  snapM?: number | null; // metres the GPS position was pulled onto the planned path (blank = not snapped)
};

// One reading of the phone's motion sensors, about 20 a second when the optional
// "record motion sensors" switch is on. Columns, in order (see MOTION_COLUMNS):
// t_ms, user acceleration x y z (m/s2, gravity removed), gravity x y z (m/s2) and
// rotation rate x y z (degrees/s). null when the sensor gave no value.
export type MotionRow = (number | null)[];

export type Recording = {
  meta: Record<string, string>;
  samples: Sample[];
  motion?: MotionRow[];
};

export const CSV_COLUMNS =
  't_ms,lat,lng,accuracy_m,speed_mps,course_deg,phone_heading_deg,target_bearing_deg,checkpoint,zone_deg,snap_m';

const RECORDING_MARKER = '# haptic-blast recording v1';
const MOTION_MARKER = '# motion';
export const MOTION_COLUMNS = 't_ms,ax,ay,az,gx,gy,gz,wx,wy,wz';

const num = (v: number | null, digits: number) =>
  v === null || Number.isNaN(v) ? '' : v.toFixed(digits);


// The sensor reading in the shape DeviceMotion (expo-sensors) gives it
export type MotionInput = {
  acceleration: { x: number; y: number; z: number } | null;
  accelerationIncludingGravity: { x: number; y: number; z: number };
  rotationRate: { alpha: number; beta: number; gamma: number } | null;
};

// One MotionRow from a reading. Gravity is the total acceleration minus the
// user's own acceleration. Missing sensors give null.
export function motionRow(tMs: number, m: MotionInput): MotionRow {
  const total = m.accelerationIncludingGravity;
  const user = m.acceleration;
  const r = m.rotationRate;
  return [
    Math.round(tMs),
    user ? user.x : null,
    user ? user.y : null,
    user ? user.z : null,
    user && total ? total.x - user.x : null,
    user && total ? total.y - user.y : null,
    user && total ? total.z - user.z : null,
    r ? r.alpha : null,
    r ? r.beta : null,
    r ? r.gamma : null,
  ];
}

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
        num(s.zone ?? null, 0),
        num(s.snapM ?? null, 1),
      ].join(',')
    );
  }
  if (recording.motion && recording.motion.length > 0) {
    lines.push(MOTION_MARKER, MOTION_COLUMNS);
    for (const row of recording.motion) {
      lines.push(
        row
          .map((v, i) => (v === null || Number.isNaN(v) ? '' : i === 0 ? String(Math.round(v)) : v.toFixed(3)))
          .join(',')
      );
    }
  }
  return lines.join('\n');
}

// Reads one or several recordings written by toCsv (concatenated or not)
export function parseCsv(text: string): Recording[] {
  const recordings: Recording[] = [];
  let current: Recording | null = null;
  let inMotion = false; // after "# motion" the rows are motion readings, not GPS samples
  const orNull = (v: string) => (v === '' ? null : Number(v));

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (line === RECORDING_MARKER) {
      current = { meta: {}, samples: [] };
      inMotion = false;
      recordings.push(current);
    } else if (line === MOTION_MARKER && current) {
      inMotion = true;
      current.motion = [];
    } else if (line.startsWith('#') && current) {
      const eq = line.indexOf('=');
      if (eq > 0) current.meta[line.slice(2, eq)] = line.slice(eq + 1);
    } else if (current && inMotion) {
      if (line.startsWith('t_ms')) continue;
      current.motion!.push(line.split(',').map((v) => (v === '' ? null : Number(v))));
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
        zone: f.length > 9 ? orNull(f[9]) : null,
        snapM: f.length > 10 ? orNull(f[10]) : null,
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
  const minSpeed = options.minSpeed ?? 0.5; // m/s; real walking pace was 0.9-1.1 m/s, so 1.0 dropped many samples
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

const pct = (v: number) => (Number.isNaN(v) ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const deg = (v: number) => (Number.isNaN(v) ? 'n/a' : `${v.toFixed(0)} deg`);

// A short plain-text report of one recording (a few lines, easy to paste)
export function formatSummary(recording: Recording, index = 0): string {
  const s = summariseHeading(recording.samples);
  const last = recording.samples[recording.samples.length - 1];
  const seconds = last ? last.t / 1000 : 0;
  const accuracies = recording.samples
    .map((x) => x.accuracy)
    .filter((a): a is number => a !== null);
  const meanAccuracy = accuracies.length
    ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
    : NaN;
  const m = recording.meta;
  const motionCount = recording.motion?.length ?? 0;

  const lines = [
    `Recording ${index + 1}: started ${m.started}`,
    `  phone carried: ${m.phone_position} | haptic=${m.haptic} sound=${m.sound} | debug mode=${m.debug_mode} | ended: ${m.ended ?? 'unknown (app closed?)'}`,
    `  ${s.samples} samples over ${seconds.toFixed(0)} s; mean GPS accuracy ${Number.isNaN(meanAccuracy) ? 'n/a' : meanAccuracy.toFixed(1) + ' m'}`,
    `  walking samples (speed >= 0.5 m/s with a GPS direction): ${s.walking} (${pct(s.walking / Math.max(s.samples, 1))})`,
  ];
  if (motionCount > 0) {
    lines.push(`  motion sensors: ${motionCount} readings (about ${(motionCount / Math.max(seconds, 1)).toFixed(0)} a second)`);
  }
  if (m.debug_mode === 'true') {
    lines.push(
      '  NOTE: debug mode, the positions are fake and the "direction of travel" is just the phone heading. Ignore this recording for any heading analysis.'
    );
  }
  if (s.walking === 0) {
    lines.push('  Not enough walking data to say anything about heading.');
    return lines.join('\n');
  }
  lines.push(
    `  phone heading vs direction of travel: average offset ${deg(s.offsetMean)}, spread ${deg(s.offsetStdDev)}`,
    `    small spread (under ~20 deg) = a fixed correction could work; large = phone orientation is not usable`,
    `  within 25 deg of the guidance target: by GPS direction ${pct(s.courseWithinToleranceOfTarget)}, by phone heading ${pct(s.phoneWithinToleranceOfTarget)}`
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Comparing many walks. The walk, not the sample, is the unit of analysis:
// samples within one walk are not independent, so each walk is reduced to a
// few numbers first and conditions are compared across walks.
// ---------------------------------------------------------------------------

export type WalkMetrics = {
  label: string;
  condition: string;
  tolerance: number; // degrees: the silent zone used to judge alignment
  minutes: number;
  samples: number;
  walking: number;
  offsetMean: number; // course - phone heading, degrees
  offsetStdDev: number;
  phoneAligned: number; // share of samples with the phone within 25 deg of the target
  courseAligned: number; // share of walking samples with the GPS direction within 25 deg
  episodesPerMin: number; // separate stretches where the phone was > 25 deg off
  meanAccuracy: number; // metres
  debug: boolean;
};

export function conditionOf(meta: Record<string, string>): string {
  const feedback =
    meta.haptic === 'true' && meta.sound === 'true'
      ? 'haptic+sound'
      : meta.haptic === 'true'
        ? 'haptic'
        : meta.sound === 'true'
          ? 'sound'
          : 'no feedback';
  return `${meta.phone_position ?? '?'} | ${feedback}`;
}

// The tolerance used to judge "aligned" is the silent zone the walk was recorded
// with (deadband_deg in the header), or 25 degrees for older recordings.
export function walkMetrics(
  rec: Recording,
  tolerance = Number(rec.meta.deadband_deg) || 25
): WalkMetrics {
  const s = rec.samples;
  const heading = summariseHeading(s, { tolerance });
  const withTarget = s.filter((x) => x.targetBearing !== null);
  let episodes = 0;
  let inEpisode = false;
  let aligned = 0;
  for (const x of withTarget) {
    const off = Math.abs(circularDiff(x.targetBearing!, x.phoneHeading)) > tolerance;
    if (!off) aligned++;
    if (off && !inEpisode) episodes++;
    inEpisode = off;
  }
  const minutes = s.length ? s[s.length - 1].t / 60000 : 0;
  const acc = s.map((x) => x.accuracy).filter((a): a is number => a !== null);
  return {
    label: rec.meta.label ?? 'unlabelled',
    condition: conditionOf(rec.meta),
    tolerance,
    minutes,
    samples: s.length,
    walking: heading.walking,
    offsetMean: heading.offsetMean,
    offsetStdDev: heading.offsetStdDev,
    phoneAligned: withTarget.length ? aligned / withTarget.length : NaN,
    courseAligned: heading.courseWithinToleranceOfTarget,
    episodesPerMin: minutes > 0 ? episodes / minutes : NaN,
    meanAccuracy: acc.length ? acc.reduce((a, b) => a + b, 0) / acc.length : NaN,
    debug: rec.meta.debug_mode === 'true',
  };
}

const exactMedian = (values: number[]) => {
  const v = values.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export type ConditionGroup = {
  condition: string;
  walks: WalkMetrics[];
};

// Group real walks (debug-mode ones are left out) by carry position + feedback
export function groupWalks(walks: WalkMetrics[]): ConditionGroup[] {
  const groups = new Map<string, WalkMetrics[]>();
  for (const w of walks) {
    if (w.debug) continue;
    groups.set(w.condition, [...(groups.get(w.condition) ?? []), w]);
  }
  return [...groups.entries()].map(([condition, list]) => ({ condition, walks: list }));
}

const f = (v: number, digits = 0) => (Number.isNaN(v) ? 'n/a' : v.toFixed(digits));
const p = (v: number) => (Number.isNaN(v) ? 'n/a' : `${Math.round(v * 100)}%`);
const range = (values: number[], fmt: (n: number) => string) => {
  const v = values.filter((x) => !Number.isNaN(x));
  return v.length > 1 ? ` [${fmt(Math.min(...v))}..${fmt(Math.max(...v))}]` : '';
};

export function formatTable(recordings: Recording[]): string {
  const all = recordings.map((r) => walkMetrics(r));
  const real = all.filter((w) => !w.debug);
  const skipped = all.length - real.length;
  const lines: string[] = [];

  lines.push(`Walks: ${real.length}${skipped ? ` (${skipped} debug-mode recording${skipped === 1 ? '' : 's'} left out: positions are fake)` : ''}`);
  lines.push('');
  lines.push(
    ['label'.padEnd(26), 'condition'.padEnd(28), 'min'.padStart(5), 'walk'.padStart(5), 'offset'.padStart(7), 'spread'.padStart(7), 'zone'.padStart(5), 'phone ok'.padStart(9), 'gps ok'.padStart(7), 'ep/min'.padStart(7), 'acc m'.padStart(6)].join(' ')
  );
  for (const w of real) {
    lines.push(
      [w.label.slice(0, 26).padEnd(26), w.condition.padEnd(28), f(w.minutes, 1).padStart(5), String(w.walking).padStart(5), (f(w.offsetMean) + '°').padStart(7), (f(w.offsetStdDev) + '°').padStart(7), ('±' + f(w.tolerance) + '°').padStart(5), p(w.phoneAligned).padStart(9), p(w.courseAligned).padStart(7), f(w.episodesPerMin, 1).padStart(7), f(w.meanAccuracy, 1).padStart(6)].join(' ')
    );
  }

  lines.push('');
  lines.push('By condition: median across walks, [min..max] when there is more than one walk');
  lines.push('  offset = GPS direction minus phone heading; spread = how much it varies;');
  lines.push('  zone = the silent zone the walk used (older recordings: 25 deg); phone ok / gps ok = share of time within that zone of the guidance target;');
  lines.push('  ep/min = separate stretches of guidance firing. Compare walks with the same zone, or read the zone column.');
  for (const g of groupWalks(all)) {
    const w = g.walks;
    lines.push('');
    lines.push(`${g.condition}  (${w.length} walk${w.length === 1 ? '' : 's'}${w.length < 3 ? ', fewer than 3: treat as anecdotal' : ''})`);
    lines.push(`  offset ${f(exactMedian(w.map((x) => x.offsetMean)))}°${range(w.map((x) => x.offsetMean), (n) => f(n) + '°')}   spread ${f(exactMedian(w.map((x) => x.offsetStdDev)))}°${range(w.map((x) => x.offsetStdDev), (n) => f(n) + '°')}`);
    lines.push(`  phone ok ${p(exactMedian(w.map((x) => x.phoneAligned)))}${range(w.map((x) => x.phoneAligned), p)}   gps ok ${p(exactMedian(w.map((x) => x.courseAligned)))}${range(w.map((x) => x.courseAligned), p)}   zone ±${f(exactMedian(w.map((x) => x.tolerance)))}°`);
    lines.push(`  episodes/min ${f(exactMedian(w.map((x) => x.episodesPerMin)), 1)}${range(w.map((x) => x.episodesPerMin), (n) => f(n, 1))}   GPS accuracy ${f(exactMedian(w.map((x) => x.meanAccuracy)), 1)} m`);
  }
  return lines.join('\n');
}
