// server/seed.js — idempotent seed data. Safe to run repeatedly (`npm run seed`):
// exercises/workouts are looked up by name/title first and skipped if already
// present; the plan template only fills days that are still unset (Rest),
// so it never clobbers a user's own schedule on re-run.
//
// Ships the required starter exercises from specs/reps.md §5 with full detail.
// A handful of supplementary exercises (Lat Pulldown, Seated Cable Row, Barbell
// Bicep Curl, Face Pull, Plank, Dead Bug, Cat-Cow Stretch, Interval Run) are
// added beyond that list so Pull Day A / Core & Mobility / 5K Interval Run have
// sensible, real exercises to reference — the required 13 alone are all
// push/leg movements and don't cover a pull day or cardio/mobility session.

import crypto from 'node:crypto';
import { db, migrate } from './db.js';

migrate();

function nowIso() {
  return new Date().toISOString();
}

function upsertExercise(ex) {
  const existing = db.prepare('SELECT id FROM exercises WHERE name = ?').get(ex.name);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = nowIso();
  db.prepare(
    `INSERT INTO exercises
      (id, name, category, equipment, difficulty, demo_file, image, source_url, muscles_worked, how_to, step_times, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ex.name,
    ex.category,
    ex.equipment,
    ex.difficulty,
    JSON.stringify(ex.muscles_worked),
    JSON.stringify(ex.how_to),
    JSON.stringify(ex.step_times || []),
    JSON.stringify(ex.tags || []),
    ts,
    ts
  );
  return id;
}

function upsertWorkout(w, idOf) {
  const existing = db.prepare('SELECT id FROM workouts WHERE title = ?').get(w.title);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const ts = nowIso();
  const exercises = w.exercises.map((e) => ({
    exercise_id: idOf(e.name),
    sets: e.sets,
    reps: e.reps,
    rest: e.rest,
  }));
  // est_minutes uses the same formula as the live API (lib/estimate.js) so seed
  // data isn't a special case; duplicated inline to avoid a circular import.
  const PER_REP_SECONDS = 3.5;
  const avg = (reps) => {
    if (typeof reps === 'number') return reps;
    const m = String(reps).match(/(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i);
    if (m) return (Number(m[1]) + Number(m[2])) / 2;
    const s = String(reps).match(/(\d+(?:\.\d+)?)/);
    return s ? Number(s[1]) : 0;
  };
  const totalSeconds = exercises.reduce((sum, e) => sum + e.sets * (avg(e.reps) * PER_REP_SECONDS + e.rest), 0);
  const est_minutes = Math.round(totalSeconds / 60 / 5) * 5;

  db.prepare(
    `INSERT INTO workouts (id, title, type, category, favorite, est_minutes, image, exercises, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL, ?, ?, ?)`
  ).run(id, w.title, w.type, w.category, est_minutes, JSON.stringify(exercises), ts, ts);
  return id;
}

const EXERCISES = [
  {
    name: 'Back Squat',
    category: 'Legs',
    equipment: 'Barbell',
    difficulty: 'Intermediate',
    muscles_worked: ['Quads', 'Glutes', 'Hamstrings', 'Core'],
    how_to: [
      'Set the bar on your upper traps; grip just outside shoulder-width and unrack.',
      'Stand with feet shoulder-width apart, toes slightly turned out.',
      'Brace your core, break at the hips and knees together, and squat until thighs are at least parallel.',
      'Drive through the whole foot to stand back up, keeping your chest up.',
    ],
    tags: ['compound', 'lower-body'],
  },
  {
    name: 'Romanian Deadlift',
    category: 'Pull',
    equipment: 'Barbell',
    difficulty: 'Intermediate',
    muscles_worked: ['Hamstrings', 'Glutes', 'Lower back'],
    how_to: [
      'Stand holding the bar at hip height, feet hip-width apart.',
      'With a soft knee bend, push your hips back and lower the bar along your legs.',
      'Keep your back flat until you feel a deep hamstring stretch, around mid-shin.',
      'Drive your hips forward to return to standing, squeezing your glutes at the top.',
    ],
    tags: ['hinge', 'posterior-chain'],
  },
  {
    name: 'Leg Press',
    category: 'Legs',
    equipment: 'Machine',
    difficulty: 'Beginner',
    muscles_worked: ['Quads', 'Glutes', 'Hamstrings'],
    how_to: [
      'Sit in the machine with feet shoulder-width apart on the platform.',
      'Release the safeties and lower the platform under control until knees reach ~90°.',
      'Press through your heels to extend your legs without locking the knees out hard.',
      'Repeat for the prescribed reps, keeping your lower back flat against the pad.',
    ],
    tags: ['machine', 'lower-body'],
  },
  {
    name: 'Walking Lunge',
    category: 'Legs',
    equipment: 'Dumbbell',
    difficulty: 'Beginner',
    muscles_worked: ['Quads', 'Glutes', 'Hamstrings'],
    how_to: [
      'Hold a dumbbell in each hand, standing tall.',
      'Step forward into a lunge, lowering the back knee toward the floor.',
      'Push through the front heel to bring the back foot forward into the next step.',
      'Continue alternating legs for the prescribed distance/reps.',
    ],
    tags: ['unilateral', 'lower-body'],
  },
  {
    name: 'Seated Leg Curl',
    category: 'Legs',
    equipment: 'Machine',
    difficulty: 'Beginner',
    muscles_worked: ['Hamstrings'],
    how_to: [
      'Sit in the machine with the pad resting just above your ankles.',
      'Adjust the lever so your knees line up with the machine’s pivot.',
      'Curl your heels down and back, squeezing your hamstrings at the bottom.',
      'Return under control to the start position.',
    ],
    tags: ['machine', 'isolation'],
  },
  {
    name: 'Standing Calf Raise',
    category: 'Legs',
    equipment: 'Machine',
    difficulty: 'Beginner',
    muscles_worked: ['Calves'],
    how_to: [
      'Position your shoulders under the pads with the balls of your feet on the platform.',
      'Lower your heels below the platform for a full stretch.',
      'Rise onto your toes as high as possible, pausing briefly at the top.',
      'Lower back down under control and repeat.',
    ],
    tags: ['machine', 'isolation'],
  },
  {
    name: 'Barbell Bench Press',
    category: 'Push',
    equipment: 'Barbell',
    difficulty: 'Intermediate',
    muscles_worked: ['Chest', 'Triceps', 'Front delts'],
    how_to: [
      'Lie flat, feet planted. Grip the bar slightly wider than shoulder-width.',
      'Unrack and hold the bar over your chest with arms straight.',
      'Lower under control to mid-chest, elbows ~45°.',
      'Press back up, driving through the mid-foot. Lock out at the top.',
    ],
    step_times: [10, 10, 15, 10],
    tags: ['compound', 'push'],
  },
  {
    name: 'Incline Dumbbell Press',
    category: 'Push',
    equipment: 'Dumbbell',
    difficulty: 'Intermediate',
    muscles_worked: ['Upper chest', 'Front delts', 'Triceps'],
    how_to: [
      'Set an incline bench to 30-45° and sit with a dumbbell in each hand at shoulder height.',
      'Press the dumbbells up and slightly inward until arms are extended.',
      'Lower under control back to the start position at shoulder level.',
      'Keep shoulder blades pulled back and down throughout.',
    ],
    tags: ['push', 'upper-chest'],
  },
  {
    name: 'Overhead Press',
    category: 'Push',
    equipment: 'Barbell',
    difficulty: 'Intermediate',
    muscles_worked: ['Shoulders', 'Triceps', 'Upper chest'],
    how_to: [
      'Hold the bar at shoulder height with hands just outside shoulder-width.',
      'Brace your core and glutes to keep your ribs stacked over your pelvis.',
      'Press the bar straight overhead, moving your head back slightly to clear it.',
      'Lock out overhead, then lower back to the shoulders under control.',
    ],
    tags: ['compound', 'shoulders'],
  },
  {
    name: 'Cable Fly',
    category: 'Push',
    equipment: 'Cable',
    difficulty: 'Beginner',
    muscles_worked: ['Chest', 'Front delts'],
    how_to: [
      'Set both pulleys above shoulder height and stand centered between them.',
      'Take a handle in each hand with a slight bend in the elbows.',
      'Sweep your hands down and together in front of your chest.',
      'Return under control to the start, feeling a stretch across the chest.',
    ],
    tags: ['isolation', 'chest'],
  },
  {
    name: 'Dips',
    category: 'Push',
    equipment: 'Bodyweight',
    difficulty: 'Intermediate',
    muscles_worked: ['Chest', 'Triceps', 'Front delts'],
    how_to: [
      'Support yourself on parallel bars with arms extended.',
      'Lean forward slightly and lower yourself until your shoulders are below your elbows.',
      'Press back up to full arm extension.',
      'Keep your core tight to avoid swinging.',
    ],
    tags: ['bodyweight', 'push'],
  },
  {
    name: 'Lateral Raise',
    category: 'Push',
    equipment: 'Dumbbell',
    difficulty: 'Beginner',
    muscles_worked: ['Side delts'],
    how_to: [
      'Stand holding a light dumbbell in each hand at your sides.',
      'With a soft bend in the elbows, raise the dumbbells out to shoulder height.',
      'Pause briefly at the top without shrugging your shoulders up.',
      'Lower under control back to the start.',
    ],
    tags: ['isolation', 'shoulders'],
  },
  {
    name: 'Skullcrusher',
    category: 'Push',
    equipment: 'EZ-bar',
    difficulty: 'Intermediate',
    muscles_worked: ['Triceps'],
    how_to: [
      'Lie on a flat bench holding an EZ-bar over your chest, arms extended.',
      'Keeping your upper arms still, bend your elbows to lower the bar toward your forehead.',
      'Stop just short of your forehead, then extend your elbows to press back up.',
      'Keep elbows pointed forward throughout the movement.',
    ],
    tags: ['isolation', 'triceps'],
  },
  // --- Supplementary (needed to populate Pull Day A / Core & Mobility / Cardio) ---
  {
    name: 'Lat Pulldown',
    category: 'Pull',
    equipment: 'Cable',
    difficulty: 'Beginner',
    muscles_worked: ['Lats', 'Biceps'],
    how_to: [
      'Sit at the machine and grip the bar wider than shoulder-width.',
      'Lean back slightly and pull the bar down to your upper chest.',
      'Squeeze your shoulder blades together at the bottom.',
      'Let the bar rise back under control to full arm extension.',
    ],
    tags: ['pull', 'back'],
  },
  {
    name: 'Seated Cable Row',
    category: 'Pull',
    equipment: 'Cable',
    difficulty: 'Beginner',
    muscles_worked: ['Mid-back', 'Lats', 'Biceps'],
    how_to: [
      'Sit with knees slightly bent, gripping the handle with arms extended.',
      'Pull the handle to your torso, driving your elbows back.',
      'Squeeze your shoulder blades together at the finish.',
      'Extend your arms back out under control, keeping your torso upright.',
    ],
    tags: ['pull', 'back'],
  },
  {
    name: 'Barbell Bicep Curl',
    category: 'Pull',
    equipment: 'Barbell',
    difficulty: 'Beginner',
    muscles_worked: ['Biceps'],
    how_to: [
      'Stand holding the bar with an underhand, shoulder-width grip.',
      'Keeping your elbows pinned to your sides, curl the bar up toward your shoulders.',
      'Squeeze at the top without swinging your torso.',
      'Lower under control back to full arm extension.',
    ],
    tags: ['isolation', 'arms'],
  },
  {
    name: 'Face Pull',
    category: 'Pull',
    equipment: 'Cable',
    difficulty: 'Beginner',
    muscles_worked: ['Rear delts', 'Upper back'],
    how_to: [
      'Set a rope attachment at upper-chest height on the cable machine.',
      'Grip the rope with thumbs facing you and step back to create tension.',
      'Pull the rope toward your face, flaring your elbows out and back.',
      'Return under control, keeping tension on the cable throughout.',
    ],
    tags: ['pull', 'rear-delts'],
  },
  {
    name: 'Plank',
    category: 'Mobility',
    equipment: 'Bodyweight',
    difficulty: 'Beginner',
    muscles_worked: ['Core', 'Shoulders'],
    how_to: [
      'Prop yourself on forearms and toes, elbows under shoulders.',
      'Squeeze your glutes and brace your core to keep a straight line from head to heels.',
      'Hold the position, breathing steadily, without letting your hips sag or pike up.',
      'Release and rest between holds.',
    ],
    tags: ['core', 'stability'],
  },
  {
    name: 'Dead Bug',
    category: 'Mobility',
    equipment: 'Bodyweight',
    difficulty: 'Beginner',
    muscles_worked: ['Core'],
    how_to: [
      'Lie on your back with arms reaching straight up and knees bent 90° over your hips.',
      'Slowly lower one arm overhead and the opposite leg toward the floor.',
      'Keep your lower back pressed flat against the floor throughout.',
      'Return to the start and repeat on the other side.',
    ],
    tags: ['core', 'stability'],
  },
  {
    name: 'Cat-Cow Stretch',
    category: 'Mobility',
    equipment: 'Bodyweight',
    difficulty: 'Beginner',
    muscles_worked: ['Spine', 'Core'],
    how_to: [
      'Start on hands and knees, wrists under shoulders and knees under hips.',
      'Inhale, drop your belly, and lift your chest and tailbone (cow).',
      'Exhale, round your spine, tucking your chin and tailbone (cat).',
      'Flow smoothly between the two positions with your breath.',
    ],
    tags: ['mobility', 'warm-up'],
  },
  {
    name: 'Interval Run',
    category: 'Cardio',
    equipment: 'None',
    difficulty: 'Intermediate',
    muscles_worked: ['Legs', 'Cardiovascular system'],
    how_to: [
      'Warm up with 5-10 minutes of easy jogging.',
      'Run each interval at a hard, sustainable pace (e.g. 400m repeats).',
      'Recover with an easy jog or walk between intervals for the prescribed rest.',
      'Cool down with 5 minutes of easy jogging and a light stretch.',
    ],
    tags: ['cardio', 'conditioning'],
  },
];

const WORKOUTS = [
  {
    title: 'Push Day A',
    type: 'Strength',
    category: 'Push',
    exercises: [
      { name: 'Barbell Bench Press', sets: 4, reps: '8-10', rest: 90 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10', rest: 75 },
      { name: 'Overhead Press', sets: 3, reps: '6-8', rest: 90 },
      { name: 'Cable Fly', sets: 3, reps: '10-12', rest: 60 },
      { name: 'Dips', sets: 3, reps: '8-12', rest: 60 },
      { name: 'Lateral Raise', sets: 3, reps: '12-15', rest: 45 },
      { name: 'Skullcrusher', sets: 3, reps: '10-12', rest: 60 },
    ],
  },
  {
    title: 'Pull Day A',
    type: 'Strength',
    category: 'Pull',
    exercises: [
      { name: 'Romanian Deadlift', sets: 4, reps: '6-8', rest: 90 },
      { name: 'Lat Pulldown', sets: 3, reps: '8-10', rest: 75 },
      { name: 'Seated Cable Row', sets: 3, reps: '8-10', rest: 75 },
      { name: 'Face Pull', sets: 3, reps: '12-15', rest: 45 },
      { name: 'Barbell Bicep Curl', sets: 3, reps: '8-10', rest: 60 },
      { name: 'Lat Pulldown', sets: 2, reps: '10-12', rest: 60 },
    ],
  },
  {
    title: 'Leg Day',
    type: 'Strength',
    category: 'Legs',
    exercises: [
      { name: 'Back Squat', sets: 4, reps: '6-8', rest: 120 },
      { name: 'Romanian Deadlift', sets: 3, reps: '8-10', rest: 90 },
      { name: 'Leg Press', sets: 3, reps: '10-12', rest: 90 },
      { name: 'Walking Lunge', sets: 3, reps: '10-12', rest: 60 },
      { name: 'Seated Leg Curl', sets: 3, reps: '10-12', rest: 60 },
      { name: 'Standing Calf Raise', sets: 4, reps: '12-15', rest: 45 },
    ],
  },
  {
    title: 'Full Body Express',
    type: 'Strength',
    category: 'Strength',
    exercises: [
      { name: 'Back Squat', sets: 3, reps: '6-8', rest: 90 },
      { name: 'Barbell Bench Press', sets: 3, reps: '8-10', rest: 75 },
      { name: 'Seated Cable Row', sets: 3, reps: '8-10', rest: 75 },
      { name: 'Overhead Press', sets: 2, reps: '8-10', rest: 60 },
      { name: 'Walking Lunge', sets: 2, reps: '10-12', rest: 45 },
    ],
  },
  {
    title: 'Core & Mobility',
    type: 'Strength',
    category: 'Mobility',
    exercises: [
      { name: 'Cat-Cow Stretch', sets: 2, reps: '8-10', rest: 15 },
      { name: 'Plank', sets: 3, reps: '1', rest: 45 },
      { name: 'Dead Bug', sets: 3, reps: '10-12', rest: 30 },
      { name: 'Standing Calf Raise', sets: 2, reps: '15-20', rest: 30 },
      { name: 'Seated Leg Curl', sets: 2, reps: '12-15', rest: 30 },
      { name: 'Lateral Raise', sets: 2, reps: '12-15', rest: 30 },
    ],
  },
  {
    title: '5K Interval Run',
    type: 'Power',
    category: 'Cardio',
    exercises: [{ name: 'Interval Run', sets: 6, reps: '1', rest: 90 }],
  },
];

// mon..sun -> workout title, or null for Rest
const PLAN = {
  mon: 'Pull Day A',
  tue: null,
  wed: 'Push Day A',
  thu: 'Leg Day',
  fri: 'Core & Mobility',
  sat: null,
  sun: '5K Interval Run',
};

export function seed() {
  const nameToId = new Map();
  for (const ex of EXERCISES) {
    nameToId.set(ex.name, upsertExercise(ex));
  }
  const idOf = (name) => {
    const id = nameToId.get(name);
    if (!id) throw new Error(`Seed workout references unknown exercise "${name}"`);
    return id;
  };

  const titleToId = new Map();
  for (const w of WORKOUTS) {
    titleToId.set(w.title, upsertWorkout(w, idOf));
  }

  // Only fill plan days that are still unset (Rest) — never clobber a user's plan.
  const setIfEmpty = db.prepare('UPDATE plan SET workout_id = ? WHERE day = ? AND workout_id IS NULL');
  for (const [day, title] of Object.entries(PLAN)) {
    if (!title) continue;
    const workoutId = titleToId.get(title);
    if (workoutId) setIfEmpty.run(workoutId, day);
  }

  // No seed sessions — a new user starts with a genuinely empty History (per
  // decision #4 / spec §5).

  console.log(`Seed complete: ${nameToId.size} exercises, ${titleToId.size} workouts.`);
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  seed();
}
