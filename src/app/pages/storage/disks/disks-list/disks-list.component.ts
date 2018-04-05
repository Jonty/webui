import { Component, ElementRef, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { RestService } from '../../../../services/';
import { TourService } from '../../../../services/tour.service';
import { debug } from 'util';
import { EntityUtils } from '../../../common/entity/utils';
import { EntityTableComponent, InputTableConf } from 'app/pages/common/entity/entity-table/entity-table.component';
import { DialogService } from 'app/services/dialog.service';
import { WebSocketService } from 'app/services/ws.service';
import { AppLoaderService } from 'app/services/app-loader/app-loader.service';
import { AfterViewInit } from '@angular/core/src/metadata/lifecycle_hooks';
import { ZfsPoolData, VolumesListTableConfig } from 'app/pages/storage/volumes/volumes-list/volumes-list.component';
import { ErdService } from 'app/services/erd.service';
import { TranslateService } from '@ngx-translate/core';
import { T } from '../../../../translate-marker';

export class DisksListConfig implements InputTableConf {


  public static BOOT_POOL: string = T("Boot Pool");

  public static DISK_NOT_IN_POOL: string = T("Unused");

  public static getRootPoolDisksQueryCall = "boot.get_disks";

  static createRootNodeVolume(): ZfsPoolData {

    const zfsRootPool: ZfsPoolData = {
      id: DisksListConfig.BOOT_POOL,
      name: DisksListConfig.BOOT_POOL,
      path: "/"

    };
    return zfsRootPool;
  }


  public flattenedVolData: any;
  public resource_name = 'storage/disk/';
  public queryCall = undefined;  // I use this in the ROOT_POOL case.
  public hideTopActions = true;
  public diskMap: Map<string, string> = new Map<string, string>();

  public columns: Array<any> = [
    { name: 'Name', prop: 'disk_name' },
    { name: 'Pool', prop: "poolName"},
    { name: 'Serial', prop: 'disk_serial' },
    { name: 'Disk Size', prop: 'disk_size' },
    { name: 'Description', prop: 'disk_description' },
    { name: 'Transfer Mode', prop: 'disk_transfermode' },
    { name: 'HDD Standby', prop: 'disk_hddstandby' },
    { name: 'Advanced Power Management', prop: 'disk_advpowermgmt' },
    { name: 'Acoustic Level', prop: 'disk_acousticlevel' },
    { name: 'Enable S.M.A.R.T.', prop: 'disk_togglesmart' },
    { name: 'S.M.A.R.T. extra options', prop: 'disk_smartoptions' },
    { name: 'Enclosure Slot', prop: 'disk_enclosure_slot' }
  ];
  public config: any = {
    paging: true,
    sorting: { columns: this.columns },
  };

  constructor(
    protected _router: Router,
    protected _classId: string,
    public title: string,
    public diskPoolMapParent: DiskPoolMapParent,
    protected loader: AppLoaderService,
    protected dialogService: DialogService,
    protected rest: RestService) {

    if (DisksListConfig.BOOT_POOL === this._classId) {
      this.resource_name = "";
      this.queryCall = DisksListConfig.getRootPoolDisksQueryCall;
    } else if (this._classId !== undefined && this._classId !== "") {
      this.resource_name += "/" + this._classId;
    }
  }

  getActions(row) {
    const actions = [];

    actions.push({
      label: T("Edit"),
      onClick: (row1) => {
        this._router.navigate(new Array('/').concat([
          "storage", "disks", "edit", row1.disk_identifier
        ]));
      }
    });

    if (this.title === "" && this.diskPoolMapParent.diskPoolMap.has(row.disk_name) === false) {
      actions.push({
        label: T("Wipe"),
        onClick: (row1) => {
          this._router.navigate(new Array('/').concat([
            "storage", "disks", "wipe", row1.disk_name
          ]));
        }
      });

    } else {  // It DOES HAVE A POOL 
      actions.push({
        label : T("Detach From Pool"),
        onClick : (row1) => {
          this.loader.open();

          this.rest.post("storage/disk/" +  row1.id + "/detach", { body: JSON.stringify({}) }).subscribe((restPostResp) => {
            this.loader.close();
            this.diskPoolMapParent.repaintMe();
          }, (res) => {
            this.loader.close();
            this.dialogService.errorReport(T("Error detaching disk: ") + row1.disk_name, res.message, res.stack);
          });
        }
      });
    }



    return actions;
  }

  rowValue(row, attr) {
    switch (attr) {
      case 'disk_size':
        return (<any>window).filesize(row[attr], { standard: "iec" });
      default:
        return row[attr];
    }
  }

  resourceTransformIncomingRestData(data: any): any {
    data = new EntityUtils().flattenData(data);
    const returnData: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const poolName = ( this.diskPoolMapParent.diskPoolMap.has(data[i].disk_name) === true) ? this.diskPoolMapParent.diskPoolMap.get(data[i].disk_name) : DisksListConfig.DISK_NOT_IN_POOL;
      data[i].poolName = poolName;

      if (this.diskMap.size < 1) {
        returnData.push(data[i]);
      } else if (this.diskMap.has(data[i].disk_name)) {
        returnData.push(data[i]);
      }
    }

    console.log("this:", this);
    return returnData;
  };

}



interface DiskPoolMapParent {
  diskPoolMap: Map<string, string>;
  repaintMe();
}


@Component({
  selector: 'app-disks-list',
  templateUrl: './disks-list.component.html'
})
export class DisksListComponent extends EntityTableComponent implements OnInit, AfterViewInit, DiskPoolMapParent {

  public diskPoolMap: Map<string, string> = new Map<string, string>();

  zfsPoolRows: ZfsPoolData[] = [];
  conf: DisksListConfig;
  public readonly ALL_DISKS = T("All Disks");
  public selectedKeyName;
  public repaintIt = true;

  public title = T("View Disks");

  constructor(protected rest: RestService, protected router: Router, protected ws: WebSocketService,
    protected _eRef: ElementRef, protected dialogService: DialogService, protected loader: AppLoaderService,
    protected erdService: ErdService, protected translate: TranslateService) {
    super(rest, router, ws, _eRef, dialogService, loader, erdService, translate);
    this.conf = new DisksListConfig(this.router, "", "All", this, this.loader, this.dialogService, this.rest);
  }


  public repaintMe() {
    this.repaintIt = false;
    setTimeout(()=>{
      this.repaintIt = true;
    }, -1);
  }

  ngOnInit(): void {

    this.selectedKeyName = this.ALL_DISKS;


    this.rest.get("storage/volume", {}).subscribe((res) => {

      if (res.data === undefined) {
        res.data = [];
      }

      // RootNode Volume is treated just a bit specially  
      // (uses boot.get_disks from WS instead of storage/disks from api/v1.0. 
      res.data.push(DisksListConfig.createRootNodeVolume());

      res.data.forEach((volume) => {
        volume.disksListConfig = new DisksListConfig(this.router, "", volume.name, this, this.loader, this.dialogService, this.rest);
        volume.type = 'zpool';
        volume.isReady = false;

        if (volume.id !== DisksListConfig.BOOT_POOL) {
          try {
            volume.avail = (<any>window).filesize(volume.avail, { standard: "iec" });
          } catch (error) {
            //console.log("error", error);
          }

          try {
            volume.used = (<any>window).filesize(volume.used, { standard: "iec" });
          } catch (error) {
            //console.log("error", error);
          }
        } 

        const volumeId = volume.id;
        const volumeObj = volume;
        
        this.zfsPoolRows.push(volume);
        
        let callQuery = (DisksListConfig.BOOT_POOL === volume.id) ? DisksListConfig.getRootPoolDisksQueryCall : "pool.get_disks";
        let args =  (DisksListConfig.BOOT_POOL === volume.id) ? [] : [volumeId];
        
        this.ws.call(callQuery, args).subscribe((resGetDisks) => {
          resGetDisks.forEach((driveName) => {
            this.diskPoolMap.set(driveName,  volume.name);
            (<DisksListConfig>volumeObj.disksListConfig).diskMap.set(driveName, driveName);
          });



          volume.isReady = true;
        });


      });

      
    });

  }

  ngAfterViewInit(): void {

  }

  tabSelectChangeHandler($event): void {
    const selectedTabName: string = $event.tab.textLabel;
    this.selectedKeyName = selectedTabName;
  }

}
