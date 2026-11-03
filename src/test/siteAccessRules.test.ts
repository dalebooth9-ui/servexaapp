import {describe,it,expect} from 'vitest';
import {accessPrintLines,accessNoteField} from '@/lib/siteAccessRules';
describe('staff-only site access',()=>{
 it('customer outputs never receive access details or codes',()=>expect(accessPrintLines({access_codes:'9472',key_location:'Reception safe',notes:'Private staff note'},'customer')).toEqual([]));
 it('engineer codes print by default',()=>expect(accessPrintLines({access_codes:'9472'},'engineer')).toEqual(['Access code(s): 9472']));
 it('masked print option uses see site file instead of codes',()=>expect(accessPrintLines({access_codes:'9472'},'engineer',false)).toEqual(['Access code(s): see site file']));
 it('one-tap saving targets access notes and cabinet keys, not test results',()=>{expect(accessNoteField('Cabinet keys')).toBe(true);expect(accessNoteField('Access')).toBe(true);expect(accessNoteField('Pressure test result')).toBe(false);});
});