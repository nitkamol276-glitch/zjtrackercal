/* สูตรคำนวณทั้งหมดของแอป — pure functions ไม่แตะ DOM ไม่แตะ IndexedDB
   ทุกอย่างที่เป็นสูตรแน่นอนอยู่ที่นี่ (Gemini ให้แค่ตัวเลขประมาณของอาหาร)
   หน่วย: kg · cm · g · km · minutes · kcal */

export const ACTIVITY_LEVELS = [
  { id: 'sedentary',  label: 'Sedentary',          factor: 1.2,   hint: 'แทบไม่ได้ออกกำลังกาย ทำงานนั่งโต๊ะ' },
  { id: 'light',      label: 'Lightly Active',     factor: 1.375, hint: 'ออกกำลังกายเบาๆ 1–3 วันต่อสัปดาห์' },
  { id: 'moderate',   label: 'Moderately Active',  factor: 1.55,  hint: 'ออกกำลังกายปานกลาง 3–5 วันต่อสัปดาห์' },
  { id: 'very',       label: 'Very Active',        factor: 1.725, hint: 'ออกกำลังกายหนัก 6–7 วันต่อสัปดาห์' },
  { id: 'extreme',    label: 'Extremely Active',   factor: 1.9,   hint: 'งานใช้แรง หรือซ้อมหนักวันละ 2 รอบ' },
];

export const GOALS = [
  { id: 'lose',     label: 'Lose weight',     short: 'Lose' },
  { id: 'maintain', label: 'Maintain weight', short: 'Maintain' },
  { id: 'gain',     label: 'Gain weight',     short: 'Gain' },
];

/* kg ต่อสัปดาห์ที่เลือกได้ สำหรับเป้าลด/เพิ่ม */
export const RATES = {
  lose: [0.25, 0.5, 0.75, 1],
  gain: [0.25, 0.5],
};

export const KCAL_PER_KG = 7700;
export const MIN_KCAL = { female: 1200, male: 1500 };
export const DEFAULT_SPLIT = { carbs: 0.5, protein: 0.2, fat: 0.3 };
export const KCAL_PER_G = { carbs: 4, protein: 4, fat: 9 };

const round = (n, step = 1) => Math.round(n / step) * step;
export const round1 = n => Math.round(n * 10) / 10;

/* ---------- ร่างกาย ---------- */

export function bmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return round1(weightKg / (m * m));
}

/* เกณฑ์ WHO Asia-Pacific (ที่กรมอนามัยใช้) */
export const BMI_BANDS = [
  { max: 18.5,     label: 'Underweight' },
  { max: 23,       label: 'Normal' },
  { max: 25,       label: 'Overweight' },
  { max: 30,       label: 'Obese I' },
  { max: Infinity, label: 'Obese II' },
];

export function bmiCategory(value) {
  if (value == null) return null;
  return BMI_BANDS.find(b => value < b.max).label;
}

/* Mifflin-St Jeor */
export function bmr({ sex, weightKg, heightCm, age }) {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0)) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'male' ? 5 : -161));
}

export function activityFactor(levelId) {
  return (ACTIVITY_LEVELS.find(l => l.id === levelId) || ACTIVITY_LEVELS[0]).factor;
}

export function tdee(bmrValue, levelId) {
  if (bmrValue == null) return null;
  return Math.round(bmrValue * activityFactor(levelId));
}

/* kcal ต่อวันที่ต้องลด (ติดลบ) หรือเพิ่ม (บวก) ตามเป้า */
export function goalAdjustment(goal, rateKgPerWeek) {
  if (goal === 'maintain' || !(rateKgPerWeek > 0)) return 0;
  const perDay = Math.round(rateKgPerWeek * KCAL_PER_KG / 7);
  return goal === 'lose' ? -perDay : perDay;
}

/* BMR → TDEE → ปรับตามเป้า → Daily Goal (คืนทุกขั้นเพื่อโชว์ที่มาของตัวเลข) */
export function calorieGoal(profile) {
  const b = bmr(profile);
  const t = tdee(b, profile.activityLevel);
  if (t == null) return null;
  const adjust = goalAdjustment(profile.goal, profile.rateKgPerWeek);
  const raw = round(t + adjust, 10);
  const floor = MIN_KCAL[profile.sex] || MIN_KCAL.female;
  const goal = Math.max(raw, floor);
  return { bmr: b, factor: activityFactor(profile.activityLevel), tdee: t, adjust, goal, clamped: goal !== raw, floor };
}

/* เป้าสารอาหาร (กรัม) จากเป้าแคลอรี่ */
export function macroTargets(kcal, split = DEFAULT_SPLIT) {
  return {
    carbs:   Math.round(kcal * split.carbs / KCAL_PER_G.carbs),
    protein: Math.round(kcal * split.protein / KCAL_PER_G.protein),
    fat:     Math.round(kcal * split.fat / KCAL_PER_G.fat),
  };
}

export function kcalFromMacros({ carbs = 0, protein = 0, fat = 0 }) {
  return Math.round(carbs * KCAL_PER_G.carbs + protein * KCAL_PER_G.protein + fat * KCAL_PER_G.fat);
}

/* เป้าที่ใช้จริง: ค่าที่ผู้ใช้ override ชนะค่าที่คำนวณ */
export function effectiveGoals(profile, goals = {}) {
  const calc = calorieGoal(profile);
  const kcal = goals.kcalOverride > 0 ? goals.kcalOverride : (calc ? calc.goal : 2000);
  const auto = macroTargets(kcal);
  const macros = goals.macrosOverride ? { ...auto, ...goals.macros } : auto;
  return { kcal, macros, calc, kcalIsCustom: goals.kcalOverride > 0, macrosAreCustom: !!goals.macrosOverride };
}

/* ---------- อาหาร ---------- */

export const NUTRIENTS = ['kcal', 'carbs', 'protein', 'fat'];

/* ย่อขยายสารอาหารตามน้ำหนักใหม่ (linear) */
export function scaleFood(food, grams) {
  const base = Number(food.grams);
  if (!(base > 0) || !(grams >= 0)) return { ...food, grams };
  const k = grams / base;
  return {
    ...food,
    grams: Math.round(grams),
    kcal: Math.round(food.kcal * k),
    carbs: round1(food.carbs * k),
    protein: round1(food.protein * k),
    fat: round1(food.fat * k),
  };
}

export function sumEntries(entries) {
  const t = { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  for (const e of entries) for (const n of NUTRIENTS) t[n] += Number(e[n]) || 0;
  t.kcal = Math.round(t.kcal);
  t.carbs = round1(t.carbs); t.protein = round1(t.protein); t.fat = round1(t.fat);
  return t;
}

/* Calories Remaining = Base Goal − Food (Activity ไม่ถูกบวกกลับ) */
export function dailySummary({ goalKcal, macroGoals, meals, activities }) {
  const food = sumEntries(meals);
  const burned = Math.round(activities.reduce((s, a) => s + (Number(a.kcal) || 0), 0));
  return {
    goal: goalKcal,
    food: food.kcal,
    activity: burned,
    remaining: goalKcal - food.kcal,
    macros: ['carbs', 'protein', 'fat'].map(k => ({
      key: k, eaten: food[k], goal: macroGoals[k], remaining: round1(macroGoals[k] - food[k]),
    })),
  };
}

/* ---------- กิจกรรม ---------- */

/* Calories Burned = MET × Weight(kg) × Duration(hours) */
export function activityKcal(met, weightKg, minutes) {
  if (!(met > 0) || !(weightKg > 0) || !(minutes > 0)) return 0;
  return Math.round(met * weightKg * (minutes / 60));
}

/* ---------- วันที่ (เวลาท้องถิ่น ไม่ใช้ UTC) ---------- */

export function ymd(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/* มื้อเริ่มต้นตามเวลาตอนนี้ */
export function mealForTime(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 21.5) return 'dinner';
  return 'snack';
}

/* แปลงข้อความที่พิมพ์เป็นตัวเลข (รองรับ , เป็นจุดทศนิยม) — คืน NaN ถ้าไม่ใช่ตัวเลข */
export function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return s === '' ? NaN : Number(s);
}

/* ---------- Insight: รวมข้อมูลเป็นช่วง ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/* buckets: [{key, label, from, to}] ช่วงวันที่แบบรวมปลาย */
export function buildBuckets(period, today = ymd()) {
  const out = [];
  if (period === 'year') {
    const t = parseYmd(today);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      out.push({
        key: ymd(start).slice(0, 7),
        label: MONTHS[start.getMonth()],
        long: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        from: ymd(start), to: ymd(end),
      });
    }
    return out;
  }
  const days = period === 'month' ? 30 : 7;
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const d = parseYmd(key);
    out.push({
      key,
      label: period === 'week' ? WEEKDAYS[d.getDay()] : String(d.getDate()),
      long: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      from: key, to: key,
    });
  }
  return out;
}

/* รวมแคลอรี่รายวันเป็นค่าต่อ bucket
   mode 'avgLogged' = เฉลี่ยต่อวันที่มีบันทึก (ใช้กับ kcal ที่กิน) · 'sum' = รวม */
export function aggregate(buckets, rows, mode) {
  const byDay = new Map();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) || 0) + (Number(r.kcal) || 0));
  return buckets.map(b => {
    let total = 0, days = 0;
    for (const [date, v] of byDay) if (date >= b.from && date <= b.to) { total += v; days++; }
    const value = mode === 'avgLogged' ? (days ? total / days : null) : (days ? total : 0);
    return { ...b, value: value == null ? null : Math.round(value), days };
  });
}

/* น้ำหนัก: ค่าล่าสุดในแต่ละ bucket (ไม่มีข้อมูล = null) */
export function weightSeries(buckets, weights) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return buckets.map(b => {
    let last = null;
    for (const w of sorted) if (w.date >= b.from && w.date <= b.to) last = w.kg;
    return { ...b, value: last };
  });
}
