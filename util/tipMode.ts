import { GlobalStore } from './globals';

// How the user wants to be reminded how to follow the guidance:
// - adaptive: full tip for the first journeys, then a small reminder
// - always: the full tip before every journey (for studies that need every
//   participant to get identical instructions)
// - off: no reminder
export type ReminderPreference = 'adaptive' | 'always' | 'off';

// What to show when a journey starts
export type TipMode = 'full' | 'compact' | 'none';

export function chooseTipMode(
  preference: ReminderPreference,
  journeysFinished: number,
  fullUntilFinished: number = GlobalStore.GUIDANCE_TIP.fullUntilFinished
): TipMode {
  if (preference === 'off') return 'none';
  if (preference === 'always') return 'full';
  return journeysFinished < fullUntilFinished ? 'full' : 'compact';
}
