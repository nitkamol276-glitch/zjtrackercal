/* ตาราง MET — ค่าจาก Compendium of Physical Activities (Ainsworth et al.)
   kcal = MET × น้ำหนัก(kg) × ชั่วโมง  (คำนวณใน calc.js)
   distance: true = มีช่องระยะทาง (km) ให้กรอก (เก็บไว้ดูเฉยๆ ไม่ใช้ในสูตร) */

export const ACTIVITIES = [
  { id: 'walking', label: 'Walking', distance: true, levels: [
    { id: 'slow',      label: 'Slow',       note: '~3 km/h',   met: 2.8 },
    { id: 'moderate',  label: 'Moderate',   note: '~5 km/h',   met: 3.5 },
    { id: 'brisk',     label: 'Brisk',      note: '~5.6 km/h', met: 4.3 },
    { id: 'very-brisk', label: 'Very brisk', note: '~6.4 km/h', met: 5.0 },
  ]},
  { id: 'running', label: 'Running', distance: true, levels: [
    { id: 'slow',      label: 'Slow',       note: '~8 km/h',    met: 8.3 },
    { id: 'moderate',  label: 'Moderate',   note: '~9.7 km/h',  met: 9.8 },
    { id: 'fast',      label: 'Fast',       note: '~11.3 km/h', met: 11.0 },
    { id: 'very-fast', label: 'Very fast',  note: '~12.9 km/h', met: 11.8 },
  ]},
  { id: 'cycling', label: 'Cycling', distance: true, levels: [
    { id: 'leisure',   label: 'Leisure',    note: '< 16 km/h',   met: 4.0 },
    { id: 'moderate',  label: 'Moderate',   note: '16–19 km/h',  met: 6.8 },
    { id: 'vigorous',  label: 'Vigorous',   note: '19–22 km/h',  met: 8.0 },
    { id: 'fast',      label: 'Fast',       note: '22–25 km/h',  met: 10.0 },
  ]},
  { id: 'stationary-bike', label: 'Stationary bike', levels: [
    { id: 'light',     label: 'Light',      met: 3.5 },
    { id: 'moderate',  label: 'Moderate',   met: 6.8 },
    { id: 'vigorous',  label: 'Vigorous',   met: 8.8 },
  ]},
  { id: 'swimming', label: 'Swimming', distance: true, levels: [
    { id: 'leisure',   label: 'Leisure',    met: 6.0 },
    { id: 'moderate',  label: 'Laps, moderate', met: 5.8 },
    { id: 'vigorous',  label: 'Laps, vigorous', met: 9.8 },
  ]},
  { id: 'strength', label: 'Weight training', levels: [
    { id: 'light',     label: 'Light',      met: 3.5 },
    { id: 'moderate',  label: 'Moderate',   met: 5.0 },
    { id: 'vigorous',  label: 'Vigorous',   met: 6.0 },
  ]},
  { id: 'hiit', label: 'HIIT / circuit', levels: [
    { id: 'moderate',  label: 'Moderate',   met: 4.3 },
    { id: 'vigorous',  label: 'Vigorous',   met: 8.0 },
  ]},
  { id: 'yoga', label: 'Yoga', levels: [
    { id: 'hatha',     label: 'Hatha / gentle', met: 2.5 },
    { id: 'power',     label: 'Power / vinyasa', met: 4.0 },
  ]},
  { id: 'pilates', label: 'Pilates', levels: [
    { id: 'general',   label: 'General',    met: 3.0 },
  ]},
  { id: 'aerobics', label: 'Aerobics / dance', levels: [
    { id: 'low',       label: 'Low impact',  met: 5.0 },
    { id: 'high',      label: 'High impact', met: 7.3 },
  ]},
  { id: 'elliptical', label: 'Elliptical', levels: [
    { id: 'moderate',  label: 'Moderate',   met: 5.0 },
  ]},
  { id: 'rowing', label: 'Rowing machine', levels: [
    { id: 'moderate',  label: 'Moderate',   met: 7.0 },
    { id: 'vigorous',  label: 'Vigorous',   met: 8.5 },
  ]},
  { id: 'jump-rope', label: 'Jump rope', levels: [
    { id: 'slow',      label: 'Slow',       met: 8.8 },
    { id: 'moderate',  label: 'Moderate',   met: 11.8 },
    { id: 'fast',      label: 'Fast',       met: 12.3 },
  ]},
  { id: 'stairs', label: 'Stair climbing', levels: [
    { id: 'slow',      label: 'Slow',       met: 4.0 },
    { id: 'fast',      label: 'Fast',       met: 8.8 },
  ]},
  { id: 'hiking', label: 'Hiking', distance: true, levels: [
    { id: 'general',   label: 'General',    met: 6.0 },
  ]},
  { id: 'badminton', label: 'Badminton', levels: [
    { id: 'social',    label: 'Social',      met: 5.5 },
    { id: 'competitive', label: 'Competitive', met: 7.0 },
  ]},
  { id: 'tennis', label: 'Tennis', levels: [
    { id: 'doubles',   label: 'Doubles',    met: 6.0 },
    { id: 'singles',   label: 'Singles',    met: 8.0 },
  ]},
  { id: 'football', label: 'Football', levels: [
    { id: 'casual',    label: 'Casual',      met: 7.0 },
    { id: 'competitive', label: 'Competitive', met: 10.0 },
  ]},
  { id: 'basketball', label: 'Basketball', levels: [
    { id: 'general',   label: 'General',    met: 6.5 },
  ]},
  { id: 'boxing', label: 'Muay Thai / boxing', levels: [
    { id: 'bag',       label: 'Punching bag', met: 5.5 },
    { id: 'sparring',  label: 'Sparring',     met: 7.8 },
  ]},
  { id: 'housework', label: 'Housework', levels: [
    { id: 'general',   label: 'General cleaning', met: 3.3 },
  ]},
];

export function findActivity(activityId, levelId) {
  const a = ACTIVITIES.find(x => x.id === activityId);
  const l = a && a.levels.find(x => x.id === levelId);
  return a && l ? { activity: a, level: l } : null;
}

/* ชื่อกิจกรรมสำหรับแสดงผล — สร้างจากตารางเสมอ (รายการเก่าที่เก็บชื่ออังกฤษไว้ก็จะแสดงเป็นไทย) */
export function activityLabel(row) {
  const f = findActivity(row.activityId, row.levelId);
  return f ? `${f.activity.label} — ${f.level.label}` : row.label;
}
