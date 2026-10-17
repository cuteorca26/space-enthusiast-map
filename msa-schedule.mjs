// Chinese MSA times are Beijing time. Expand explicit daily windows; do not
// confuse a daily work schedule with one uninterrupted multi-day restriction.
export function chineseDailyWindows(text, year) {
  const date='(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})(?:日)?';
  const end='(?:(\\d{4})年)?(?:(\\d{1,2})月)?(\\d{1,2})日';
  // Time alternatives are parsed separately to keep captures unambiguous.
  const pattern=new RegExp(date+'\\s*(?:至|到|—|－|-)\\s*'+end+'[，,\\s]*(?:每日|每天|日)\\s*([^。\\n]{1,100})','g');
  const intervals=[],spans=[],labels=[],errors=[];
  for(const m of String(text).matchAll(pattern)){
    const times=m[7].match(/^(\d{1,2}(?:[:：时]\d{2}分?|时)|\d{4}时?)\s*(?:至|到|—|－|-)\s*(\d{1,2}(?:[:：时]\d{2}分?|时)|\d{4}时?)/);
    if(!times)continue;
    const clock=s=>{const n=s.replace(/时/g,':').replace(/分/g,'').replace(/:$/,'');if(/^\d{4}$/.test(n))return [Number(n.slice(0,2)),Number(n.slice(2))];const a=n.split(/[:：]/).map(Number);return [a[0],a[1]||0];};
    const a=clock(times[1]),b=clock(times[2]),sy=Number(m[1]||year),sm=Number(m[2]),em=Number(m[5]||sm),ey=Number(m[4]||sy+(em<sm?1:0));
    const start=validChinaDate(sy,sm,Number(m[3])),endDate=validChinaDate(ey,em,Number(m[6]));
    const spanEnd=m.index+m[0].length-m[7].length+times[0].length;
    spans.push([m.index,spanEnd]);labels.push(text.slice(m.index,spanEnd));
    if(!start||!endDate||Date.parse(endDate)<Date.parse(start)||(Date.parse(endDate)-Date.parse(start))/86400000>730||!validClock(...a)||!validClock(...b)||a[0]===24){errors.push('每日作业时间含无效日期或时刻');continue;}
    for(let day=Date.parse(start);day<=Date.parse(endDate);day+=86400000){const s=day+(a[0]*60+a[1])*60000;let e=day+(b[0]*60+b[1])*60000;if(e<=s)e+=86400000;intervals.push({start:new Date(s).toISOString(),end:new Date(e).toISOString()});}
  }
  let remaining=text;for(const [a,b]of spans.reverse())remaining=remaining.slice(0,a)+' '.repeat(b-a)+remaining.slice(b);
  return {intervals,remaining,labels,errors,recognized:!!spans.length};
}
export function validClock(hour,minute){return Number.isInteger(hour)&&Number.isInteger(minute)&&hour>=0&&hour<=24&&minute>=0&&minute<60&&(hour!==24||minute===0);}
export function validChinaDate(year,month,day,hour=0,minute=0){
  if(![year,month,day].every(Number.isInteger)||year<1900||month<1||month>12||day<1||!validClock(hour,minute))return null;
  const d=new Date(Date.UTC(year,month-1,day));if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return null;
  return new Date(d.getTime()+(hour-8)*3600000+minute*60000).toISOString();
}
