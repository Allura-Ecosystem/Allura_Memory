import {type SQL} from 'bun';
import {type Route} from './gateway.ts';
import {deviceCommand} from './devices.ts';
export function createDeviceRoutes(sql:SQL):Route[]{return [{
 path:'/api/devices/command',method:'POST',identity:'human',action:'memory:read',
 additionalActions:body=>body?.kind==='approve'?['workspace:grants:manage']:[],
 handle:({identity,scope,body,signal})=>deviceCommand(sql,identity,scope,body,signal),
}];}
