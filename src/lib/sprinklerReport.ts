/** Residential Sprinkler Service report layout (sections 1-7). Plant sections are hidden for single houses. */
export type Check={id:string;label:string};
export type Section={id:string;title:string;plant:boolean;checks:Check[];values?:{id:string;label:string}[];register?:[string,string][]};
export const SPRINKLER_SECTIONS:Section[]=[
 {id:'supplies',title:'1. Water supplies room',plant:false,register:[['supply_room_location','Location'],['supply_type','Supply type']],checks:[
  {id:'wsr_secure',label:'Room secure'},{id:'wsr_lighting',label:'Lighting sufficient'},{id:'wsr_temp',label:'Temperature maintained above 4°C'},{id:'wsr_no_leaks',label:'Free of leaks / water ingress'},{id:'wsr_labelled',label:'Components clearly labelled'},{id:'wsr_plate',label:'Location plate fitted externally'},{id:'msv_open',label:'Main stop valve open, secured and labelled'}]},
 {id:'tank',title:'2. Storage tank',plant:true,register:[['tank_location','Location'],['tank_manufacturer','Manufacturer'],['tank_type','Type']],checks:[
  {id:'tank_capacity',label:'Capacity adequate and topped up'},{id:'tank_leaks',label:'Free of leaks'},{id:'tank_infill',label:'Infill isolation / float valve exercised'},{id:'tank_suction',label:'Suction isolation valve exercised and secured open'},{id:'tank_low_signal',label:'Low water signal received on panel'},{id:'tank_overflow',label:'Overflow and tell-tale fitted'},{id:'tank_gauge',label:'Contents gauge operating'}]},
 {id:'pump',title:'3. Pump',plant:true,register:[['pump_location','Location'],['pump_manufacturer','Manufacturer'],['pump_type','Type'],['pump_rated_flow','Rated flow (L/min)'],['pump_rated_pressure','Rated pressure (bar)']],checks:[
  {id:'pump_leaks',label:'Free of leaks'},{id:'pump_suction',label:'Suction valve exercised, fault signal, secured open'},{id:'pump_delivery',label:'Delivery valve exercised, fault signal, secured open'},{id:'pump_fire_signal',label:'Fire signal received with pump running'},{id:'pump_power_fault',label:'Fault signal on power removal'},{id:'pump_gauges',label:'Suction and delivery gauges functioning'}],
  values:[{id:'flow_achieved',label:'Flow test achieved (L/min)'},{id:'pressure_achieved',label:'Pressure test achieved (bar)'}]},
 {id:'zones',title:'4. Zone valves',plant:true,checks:[]},
 {id:'monitoring',title:'5. Monitoring',plant:true,register:[['panel_location','Panel location'],['panel_make','Make'],['panel_monitored_by','Monitored by']],checks:[
  {id:'mon_fire_ind',label:'Fire signals indicated on panel'},{id:'mon_fire_relay',label:'Fire signals relayed to monitoring'},{id:'mon_fault_ind',label:'Fault signals indicated on panel'},{id:'mon_fault_relay',label:'Fault signals relayed to monitoring'}]},
 {id:'general',title:'6. General condition',plant:false,checks:[
  {id:'gc_no_leaks',label:'No leaks attributable to the system'},{id:'gc_heads',label:'Heads unobstructed, not painted or damaged'},{id:'gc_covers',label:'Cover plates in good condition'},{id:'gc_no_mods',label:'No unrecorded modifications'},{id:'gc_frost',label:'Frost protection adequate'},{id:'gc_logbook',label:'Occupier log book updated'}]},
];
export const visibleSections=(systemType:string)=>SPRINKLER_SECTIONS.filter(s=>!(systemType==='house'&&s.plant));
export const allChecks=(systemType:string)=>visibleSections(systemType).flatMap(s=>s.checks);
