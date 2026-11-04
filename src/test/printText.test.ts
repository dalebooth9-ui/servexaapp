import {describe,it,expect} from 'vitest';
import {printName,printInspectionType,printInspectionDate,printInspectionResult} from '@/lib/printText';
import {printColourChoice} from '@/lib/printBrandingRules';
describe('print-only paperwork formatting',()=>{
 it('formats all-caps names without changing a reference or postcode',()=>{
  const saved='SPRAYTON WAY - BLOCK 1, EX4 4QS, VFP-00264, BS 9990, QR ABC234';
  expect(printName(saved)).toBe('Sprayton Way - Block 1, EX4 4QS, VFP-00264, BS 9990, QR ABC234');
  expect(saved).toBe('SPRAYTON WAY - BLOCK 1, EX4 4QS, VFP-00264, BS 9990, QR ABC234');
 });
 it('preserves abbreviations and mixed-case names',()=>expect(printName('PVC UK McDonald')).toBe('PVC UK McDonald'));
 it('prints readable pressure inspection type',()=>expect(printInspectionType('pressure_test')).toBe('Pressure test'));
 it('prints readable visual inspection type',()=>expect(printInspectionType('visual_inspection')).toBe('Visual inspection'));
 it('prints an inspection date in UK format',()=>expect(printInspectionDate('2026-11-04')).toBe('04/11/2026'));
 it('prints Pass and Fail',()=>{expect(printInspectionResult('PASS')).toBe('Pass');expect(printInspectionResult('fail')).toBe('Fail');});
 it('uses a customer colour such as Besseges red',()=>expect(printColourChoice('#c8102e',{isViva:true,primaryColor:'#123456'})).toBe('#c8102e'));
 it('defaults Viva to Viva blue',()=>expect(printColourChoice(null,{isViva:true})).toBe('#1F4E79'));
 it('defaults another company to its own colour',()=>expect(printColourChoice(null,{isViva:false,primaryColor:'#234567'})).toBe('#234567'));
 it('never lends Viva blue to an unbranded company',()=>expect(printColourChoice(null,{isViva:false})).toBe('#808080'));
});