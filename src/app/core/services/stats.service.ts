import { Injectable } from '@angular/core';
import { BaseService } from './base.service';
import { CoreEvent } from './core.service';

/*export interface Temperature {
  keys: string[];
  values: any;
  unit: string;
  symbolText: string;
}*/

@Injectable({
  providedIn: 'root'
})
export class StatsService extends BaseService {

  protected disks: any[] = [];
  protected broadcast;
  protected subscribers: number = 0;

  constructor() { 
    super();
  }

  protected onAuthenticated(evt: CoreEvent){
    this.authenticated = true;
   
    // TODO: use disk.query to detect drive change events
    const queryOptions = {"select":["name", "type"]};

    this.websocket.sub("reporting.realtime").subscribe((res) => {
      this.core.emit({name: "RealtimeStats", data: res, sender: this});
    });
  }

}
