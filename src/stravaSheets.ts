import type { ExternalActivity } from './types'
import { classifyStravaActivity } from './activityClassification'

const sheet={id:'1OdK4ydfb4Xb4ZFbp1KnAwLeJfxBy7EjhnzRBPblzozY',gid:'1368002166'}
const parseCsv=(text:string)=>{const rows:string[][]=[],row:string[]=[],pattern=/(?:^|,|\r?\n)(?:"((?:""|[^"])*)"|([^,"\r\n]*))/g;let match:RegExpExecArray|null;while((match=pattern.exec(text.replace(/^\uFEFF/,'')))){if(match[0].startsWith('\n')||match[0].startsWith('\r'))rows.push(row.splice(0));row.push((match[1]??match[2]??'').replaceAll('""','"'))}if(row.length)rows.push(row);return rows}
const activityType=(sport:string):ExternalActivity['type']|undefined=>{const value=sport.toLowerCase();if(value.includes('run'))return 'run';if(value.includes('walk')||value.includes('hike'))return 'walk';if(value.includes('ride')||value.includes('cycle'))return 'cycle'}
const activityDate=(value:string)=>{const match=value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(!match)throw new Error('Unrecognised activity date: '+value);return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`}
const numeric=(columns:string[],index:number)=>index<0||!columns[index]?.trim()?undefined:Number.isFinite(Number(columns[index]))?Number(columns[index]):undefined
const truthy=(columns:string[],index:number)=>index>=0&&['true','yes','1'].includes((columns[index]??'').trim().toLowerCase())

async function fetchBestEfforts(){
 const response=await fetch(`https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Best Efforts')}`,{cache:'no-store'})
 const byId=new Map<string,NonNullable<ExternalActivity['bestEfforts']>>()
 if(!response.ok)return byId
 const rows=parseCsv(await response.text()),headers=rows.shift()?.map(value=>value.trim().toLowerCase())??[],column=(name:string)=>headers.indexOf(name),idIndex=column('strava id'),distanceIndex=column('distance'),secondsIndex=column('time seconds')
 if(idIndex<0||distanceIndex<0||secondsIndex<0)return byId
 const keys:Record<string,keyof NonNullable<ExternalActivity['bestEfforts']>>={'5k':'5k','10k':'10k','half marathon':'halfMarathon','marathon':'marathon','50k ultra':'50k'}
 rows.forEach(columns=>{const id=columns[idIndex]?.trim(),key=keys[columns[distanceIndex]?.trim().toLowerCase()],seconds=Number(columns[secondsIndex]);if(!id||!key||seconds<=0)return;byId.set(id,{...(byId.get(id)??{}),[key]:seconds})})
 return byId
}

export async function fetchStravaActivities():Promise<ExternalActivity[]>{
 const [response,bestEfforts]=await Promise.all([fetch(`https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`,{cache:'no-store'}),fetchBestEfforts()])
 if(!response.ok)throw new Error(`Strava sheet returned ${response.status}`)
 const rows=parseCsv(await response.text()),headers=rows.shift()?.map(value=>value.trim().toLowerCase())??[],column=(name:string)=>headers.indexOf(name)
 const indexes={date:column('date'),title:column('title'),sport:column('sport'),duration:column('duration (min)'),km:column('km'),speed:column('speed (km/h)'),heartRate:column('heart rate'),maxHeartRate:column('max heart rate'),cadence:column('cadence'),elevation:column('elevation (m)'),url:column('url'),id:column('strava id'),averagePower:column('average power (w)'),weightedPower:column('weighted power (w)'),maxPower:column('max power (w)'),calories:column('calories'),kilojoules:column('kilojoules'),workoutType:column('workout type'),trainer:column('trainer'),commute:column('commute')}
 if(['date','title','sport','duration','km','url','id'].some(key=>indexes[key as keyof typeof indexes]<0))throw new Error('The Strava sheet columns have changed.')
 const byId=new Map<string,ExternalActivity>()
 rows.forEach(columns=>{try{const sourceSport=columns[indexes.sport]??'',type=activityType(sourceSport),stravaUrl=(columns[indexes.url]??'').trim(),id=(columns[indexes.id]??'').trim()||stravaUrl.match(/activities\/(\d+)/)?.[1];if(!type||!id)return;const activity:ExternalActivity={id,date:activityDate(columns[indexes.date]),title:columns[indexes.title]?.trim()||type,type,sourceSport,distanceKm:Number(columns[indexes.km])||0,durationSeconds:Math.round((Number(columns[indexes.duration])||0)*60),averageSpeedKph:numeric(columns,indexes.speed),averageHeartRate:numeric(columns,indexes.heartRate),maxHeartRate:numeric(columns,indexes.maxHeartRate),averageCadence:numeric(columns,indexes.cadence),elevationGainM:numeric(columns,indexes.elevation),averagePowerWatts:numeric(columns,indexes.averagePower),weightedAveragePowerWatts:numeric(columns,indexes.weightedPower),maxPowerWatts:numeric(columns,indexes.maxPower),calories:numeric(columns,indexes.calories),kilojoules:numeric(columns,indexes.kilojoules),workoutType:numeric(columns,indexes.workoutType),trainer:truthy(columns,indexes.trainer),commute:truthy(columns,indexes.commute),stravaUrl,bestEfforts:bestEfforts.get(id)};activity.activityTags=classifyStravaActivity(activity);byId.set(id,activity)}catch{return}})
 return [...byId.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))
}
