import { describe, it, expect } from 'vitest';
import {
  exerciseDoableAtGym,
  equipmentNeedsLabel,
  buildSubstitutesMap,
  formatEquipmentGroups,
} from './equipment';

describe('formatEquipmentGroups', () => {
  it('empty groups -> Bodyweight', () => {
    expect(formatEquipmentGroups([])).toBe('Bodyweight');
  });
  it('all-empty groups -> Bodyweight', () => {
    expect(formatEquipmentGroups([[], []])).toBe('Bodyweight');
  });
  it('single-item groups join with " + "', () => {
    expect(formatEquipmentGroups([['Barbell'], ['Bench']])).toBe('Barbell + Bench');
  });
  it('multi-item group renders with parens and "or"', () => {
    expect(formatEquipmentGroups([['Dip Station', 'Bench']])).toBe('(Dip Station or Bench)');
  });
  it('mixed single and multi-item groups', () => {
    expect(formatEquipmentGroups([['Barbell'], ['Flat Bench', 'Adjustable Bench']])).toBe(
      'Barbell + (Flat Bench or Adjustable Bench)'
    );
  });
  it('trims whitespace and drops blanks within groups', () => {
    expect(formatEquipmentGroups([[' Barbell ', ''], ['Bench']])).toBe('Barbell + Bench');
  });
});

describe('equipmentNeedsLabel', () => {
  it('empty equipment_groups -> Bodyweight', () => {
    expect(equipmentNeedsLabel({ equipment_groups: [] })).toBe('Bodyweight');
  });
  it('single group renders bare', () => {
    expect(equipmentNeedsLabel({ equipment_groups: [['Barbell']] })).toBe('Barbell');
  });
  it('multiple groups join with " + "', () => {
    expect(equipmentNeedsLabel({ equipment_groups: [['Barbell'], ['Bench']] })).toBe(
      'Barbell + Bench'
    );
  });
  it('OR group renders with "or"', () => {
    expect(equipmentNeedsLabel({ equipment_groups: [['Dip Station', 'Bench']] })).toBe(
      '(Dip Station or Bench)'
    );
  });
});

describe('exerciseDoableAtGym', () => {
  it('Any gym (null) is always doable', () => {
    expect(exerciseDoableAtGym({ equipment_groups: [['Barbell']] }, null)).toBe(true);
  });

  it('empty equipment_groups -> always doable (bodyweight)', () => {
    expect(exerciseDoableAtGym({ equipment_groups: [] }, { equipment: [] })).toBe(true);
  });

  it('single-group match — gym has the exact item', () => {
    const ex = { equipment_groups: [['Barbell']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Dumbbells'] })).toBe(false);
  });

  it('multi-group all-required (AND) — missing one group fails', () => {
    const ex = { equipment_groups: [['Barbell'], ['Bench']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell', 'Bench'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell'] })).toBe(false);
    expect(exerciseDoableAtGym(ex, { equipment: ['Bench'] })).toBe(false);
  });

  it('OR within a group — gym having just one alternative is doable', () => {
    const ex = { equipment_groups: [['Dip Station', 'Bench']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Dip Station'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Bench'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Dumbbells'] })).toBe(false);
  });

  it('AND across groups + OR within a group combined', () => {
    const ex = { equipment_groups: [['Barbell'], ['Flat Bench', 'Adjustable Bench']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell', 'Flat Bench'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell', 'Adjustable Bench'] })).toBe(true);
    expect(exerciseDoableAtGym(ex, { equipment: ['Barbell'] })).toBe(false);
    expect(exerciseDoableAtGym(ex, { equipment: ['Flat Bench'] })).toBe(false);
  });

  it('substitutes expansion — gym item counts as its managed substitutes (list form)', () => {
    const equipmentList = [{ name: 'Adjustable Bench', substitutes: ['Bench'] }];
    const ex = { equipment_groups: [['Barbell'], ['Bench']] };
    expect(
      exerciseDoableAtGym(ex, { equipment: ['Barbell', 'Adjustable Bench'] }, equipmentList)
    ).toBe(true);
  });

  it('substitutes expansion — prebuilt Map form', () => {
    const equipmentList = [{ name: 'Adjustable Bench', substitutes: ['Bench'] }];
    const map = buildSubstitutesMap(equipmentList);
    const ex = { equipment_groups: [['Bench']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Adjustable Bench'] }, map)).toBe(true);
  });

  it('falls back to plain matching (no expansion) when no equipment list is given', () => {
    const ex = { equipment_groups: [['Bench']] };
    expect(exerciseDoableAtGym(ex, { equipment: ['Adjustable Bench'] })).toBe(false);
  });
});
