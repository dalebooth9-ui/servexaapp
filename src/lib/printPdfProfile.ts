import type jsPDF from 'jspdf';
import type {DocumentBrandingProfile} from './documentBrandingProfile';
export const printPdfProfiles=new WeakMap<jsPDF,{profile:DocumentBrandingProfile;logoPages:Set<number>}>();
export function registerPrintPdf(doc:jsPDF,profile:DocumentBrandingProfile,logoDrawn=false){const current=printPdfProfiles.get(doc);const value=current||{profile,logoPages:new Set<number>()};value.profile=profile;if(logoDrawn)value.logoPages.add(doc.getCurrentPageInfo().pageNumber);printPdfProfiles.set(doc,value);}