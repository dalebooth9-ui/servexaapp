import {describe,it,expect} from 'vitest';
import {riserReportUrl,isScanPrivateField} from '@/lib/riserScanFlow';
describe('engineer riser scan navigation and privacy',()=>{
 it('opens the exact response in scan mode on its job',()=>expect(riserReportUrl('job-a','response-b','template-c')).toBe('/jobs/job-a?riserScan=1&response=response-b&template=template-c'));
 it.each(['PO Number','Purchase order','Total cost','Price','Quote','Rate'])('excludes office financial field %s',label=>expect(isScanPrivateField({label})).toBe(true));
 it.each(['Outlets','Test Pressure (bar)','Customer details','Riser location'])('retains service field %s',label=>expect(isScanPrivateField({label})).toBe(false));
});