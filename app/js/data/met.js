/* ตาราง MET — ค่าจาก Compendium of Physical Activities (Ainsworth et al.)
   kcal = MET × น้ำหนัก(kg) × ชั่วโมง  (คำนวณใน calc.js)
   distance: true = มีช่องระยะทาง (km) ให้กรอก (เก็บไว้ดูเฉยๆ ไม่ใช้ในสูตร) */

export const ACTIVITIES = [
  { id: 'walking', label: 'เดิน', distance: true, levels: [
    { id: 'slow',      label: 'ช้า',       note: '~3 km/ชม.',   met: 2.8 },
    { id: 'moderate',  label: 'ปานกลาง',   note: '~5 km/ชม.',   met: 3.5 },
    { id: 'brisk',     label: 'เร็ว',      note: '~5.6 km/ชม.', met: 4.3 },
    { id: 'very-brisk',label: 'เร็วมาก', note: '~6.4 km/ชม.', met: 5.0 },
  ]},
  { id: 'running', label: 'วิ่ง', distance: true, levels: [
    { id: 'slow',      label: 'ช้า',       note: '~8 km/ชม.',    met: 8.3 },
    { id: 'moderate',  label: 'ปานกลาง',   note: '~9.7 km/ชม.',  met: 9.8 },
    { id: 'fast',      label: 'เร็ว',       note: '~11.3 km/ชม.', met: 11.0 },
    { id: 'very-fast', label: 'เร็วมาก',  note: '~12.9 km/ชม.', met: 11.8 },
  ]},
  { id: 'cycling', label: 'ปั่นจักรยาน', distance: true, levels: [
    { id: 'leisure',   label: 'สบายๆ',    note: '< 16 km/ชม.',   met: 4.0 },
    { id: 'moderate',  label: 'ปานกลาง',   note: '16–19 km/ชม.',  met: 6.8 },
    { id: 'vigorous',  label: 'หนัก',   note: '19–22 km/ชม.',  met: 8.0 },
    { id: 'fast',      label: 'เร็ว',       note: '22–25 km/ชม.',  met: 10.0 },
  ]},
  { id: 'stationary-bike', label: 'จักรยานอยู่กับที่', levels: [
    { id: 'light',     label: 'เบา',      met: 3.5 },
    { id: 'moderate',  label: 'ปานกลาง',   met: 6.8 },
    { id: 'vigorous',  label: 'หนัก',   met: 8.8 },
  ]},
  { id: 'swimming', label: 'ว่ายน้ำ', distance: true, levels: [
    { id: 'leisure',   label: 'สบายๆ',    met: 6.0 },
    { id: 'moderate',  label: 'ว่ายรอบ ปานกลาง', met: 5.8 },
    { id: 'vigorous',  label: 'ว่ายรอบ หนัก', met: 9.8 },
  ]},
  { id: 'strength', label: 'เวทเทรนนิ่ง', levels: [
    { id: 'light',     label: 'เบา',      met: 3.5 },
    { id: 'moderate',  label: 'ปานกลาง',   met: 5.0 },
    { id: 'vigorous',  label: 'หนัก',   met: 6.0 },
  ]},
  { id: 'hiit', label: 'HIIT / เซอร์กิต', levels: [
    { id: 'moderate',  label: 'ปานกลาง',   met: 4.3 },
    { id: 'vigorous',  label: 'หนัก',   met: 8.0 },
  ]},
  { id: 'yoga', label: 'โยคะ', levels: [
    { id: 'hatha',     label: 'หฐะ / เบาๆ', met: 2.5 },
    { id: 'power',     label: 'พาวเวอร์ / วินยาสะ', met: 4.0 },
  ]},
  { id: 'pilates', label: 'พิลาทิส', levels: [
    { id: 'general',   label: 'ทั่วไป',    met: 3.0 },
  ]},
  { id: 'aerobics', label: 'แอโรบิก / เต้น', levels: [
    { id: 'low',       label: 'แรงกระแทกต่ำ',  met: 5.0 },
    { id: 'high',      label: 'แรงกระแทกสูง', met: 7.3 },
  ]},
  { id: 'elliptical', label: 'เครื่องเดินวงรี', levels: [
    { id: 'moderate',  label: 'ปานกลาง',   met: 5.0 },
  ]},
  { id: 'rowing', label: 'เครื่องพายเรือ', levels: [
    { id: 'moderate',  label: 'ปานกลาง',   met: 7.0 },
    { id: 'vigorous',  label: 'หนัก',   met: 8.5 },
  ]},
  { id: 'jump-rope', label: 'กระโดดเชือก', levels: [
    { id: 'slow',      label: 'ช้า',       met: 8.8 },
    { id: 'moderate',  label: 'ปานกลาง',   met: 11.8 },
    { id: 'fast',      label: 'เร็ว',       met: 12.3 },
  ]},
  { id: 'stairs', label: 'ขึ้นบันได', levels: [
    { id: 'slow',      label: 'ช้า',       met: 4.0 },
    { id: 'fast',      label: 'เร็ว',       met: 8.8 },
  ]},
  { id: 'hiking', label: 'เดินป่า', distance: true, levels: [
    { id: 'general',   label: 'ทั่วไป',    met: 6.0 },
  ]},
  { id: 'badminton', label: 'แบดมินตัน', levels: [
    { id: 'social',    label: 'ตีเล่น',      met: 5.5 },
    { id: 'competitive', label: 'แข่งขัน', met: 7.0 },
  ]},
  { id: 'tennis', label: 'เทนนิส', levels: [
    { id: 'doubles',   label: 'คู่',    met: 6.0 },
    { id: 'singles',   label: 'เดี่ยว',    met: 8.0 },
  ]},
  { id: 'football', label: 'ฟุตบอล', levels: [
    { id: 'casual',    label: 'เล่นสนุก',      met: 7.0 },
    { id: 'competitive', label: 'แข่งขัน', met: 10.0 },
  ]},
  { id: 'basketball', label: 'บาสเกตบอล', levels: [
    { id: 'general',   label: 'ทั่วไป',    met: 6.5 },
  ]},
  { id: 'boxing', label: 'มวยไทย / ชกมวย', levels: [
    { id: 'bag',       label: 'ชกกระสอบ', met: 5.5 },
    { id: 'sparring',  label: 'ซ้อมคู่',     met: 7.8 },
  ]},
  { id: 'housework', label: 'ทำงานบ้าน', levels: [
    { id: 'general',   label: 'ทำความสะอาดทั่วไป', met: 3.3 },
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
