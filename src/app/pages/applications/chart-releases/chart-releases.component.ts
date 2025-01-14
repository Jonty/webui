import {
  Component, Output, EventEmitter, OnInit,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog/dialog-ref';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import * as _ from 'lodash';
import { appImagePlaceholder, ixChartApp } from 'app/constants/catalog.constants';
import { CommonUtils } from 'app/core/classes/common-utils';
import { CoreService } from 'app/core/services/core-service/core.service';
import { ChartReleaseStatus } from 'app/enums/chart-release-status.enum';
import helptext from 'app/helptext/apps/apps';
import { ApplicationUserEventName, UpgradeSummary } from 'app/interfaces/application.interface';
import { ChartRelease } from 'app/interfaces/chart-release.interface';
import { CoreBulkResponse } from 'app/interfaces/core-bulk.interface';
import { CoreEvent } from 'app/interfaces/events';
import { Job } from 'app/interfaces/job.interface';
import { ChartUpgradeDialog } from 'app/pages/applications/dialogs/chart-upgrade/chart-upgrade-dialog.component';
import { ChartUpgradeDialogConfig } from 'app/pages/applications/interfaces/chart-upgrade-dialog-config.interface';
import { DialogFormConfiguration } from 'app/pages/common/entity/entity-dialog/dialog-form-configuration.interface';
import { EntityDialogComponent } from 'app/pages/common/entity/entity-dialog/entity-dialog.component';
import { EmptyConfig, EmptyType } from 'app/pages/common/entity/entity-empty/entity-empty.component';
import { EntityJobComponent } from 'app/pages/common/entity/entity-job/entity-job.component';
import { EntityUtils } from 'app/pages/common/entity/utils';
import { AppLoaderService } from 'app/services/app-loader/app-loader.service';
import { DialogService, SystemGeneralService, WebSocketService } from 'app/services/index';
import { ModalService } from 'app/services/modal.service';
import { ApplicationsService } from '../applications.service';
import { ChartEventsDialog } from '../dialogs/chart-events/chart-events-dialog.component';
import { ChartFormComponent } from '../forms/chart-form.component';

@UntilDestroy()
@Component({
  selector: 'app-charts',
  templateUrl: './chart-releases.component.html',
  styleUrls: ['../applications.component.scss'],
})

export class ChartReleasesComponent implements OnInit {
  @Output() updateTab = new EventEmitter();

  filteredChartItems: ChartRelease[] = [];
  filterString = '';

  chartItems: Record<string, ChartRelease> = {};
  @Output() switchTab = new EventEmitter<string>();

  private dialogRef: MatDialogRef<EntityJobComponent>;
  ixIcon = 'assets/images/ix-original.png';
  private rollbackChartName: string;

  protected utils: CommonUtils;

  private selectedAppName: string;
  private podList: string[] = [];
  private podDetails: Record<string, string[]> = {};
  imagePlaceholder = appImagePlaceholder;

  emptyPageConf: EmptyConfig = {
    type: EmptyType.Loading,
    large: true,
    title: helptext.message.loading,
    button: {
      label: 'View Catalog',
      action: this.viewCatalog.bind(this),
    },
  };

  rollBackChart: DialogFormConfiguration = {
    title: helptext.charts.rollback_dialog.title,
    fieldConfig: [{
      type: 'input',
      name: 'item_version',
      placeholder: helptext.charts.rollback_dialog.version.placeholder,
      tooltip: helptext.charts.rollback_dialog.version.tooltip,
      required: true,
    }, {
      type: 'checkbox',
      name: 'rollback_snapshot',
      placeholder: helptext.charts.rollback_dialog.snapshot.placeholder,
      tooltip: helptext.charts.rollback_dialog.snapshot.tooltip,
    }],
    method_ws: 'chart.release.rollback',
    saveButtonText: helptext.charts.rollback_dialog.action,
    customSubmit: this.doRollback,
    parent: this,
  };

  choosePod: DialogFormConfiguration = {
    title: helptext.podConsole.choosePod.title,
    fieldConfig: [{
      type: 'select',
      name: 'pods',
      placeholder: helptext.podConsole.choosePod.placeholder,
      required: true,
    }, {
      type: 'select',
      name: 'containers',
      placeholder: helptext.podConsole.chooseConatiner.placeholder,
      required: true,
    }, {
      type: 'input',
      name: 'command',
      placeholder: helptext.podConsole.chooseCommand.placeholder,
      value: '/bin/bash',
    }],
    saveButtonText: helptext.podConsole.choosePod.action,
    customSubmit: this.doPodSelect,
    afterInit: this.afterShellDialogInit,
    parent: this,
  };

  choosePodForLogs: DialogFormConfiguration = {
    title: helptext.podLogs.title,
    fieldConfig: [{
      type: 'select',
      name: 'pods',
      placeholder: helptext.podLogs.choosePod.placeholder,
      required: true,
    }, {
      type: 'select',
      name: 'containers',
      placeholder: helptext.podLogs.chooseConatiner.placeholder,
      required: true,
    }, {
      type: 'input',
      name: 'tail_lines',
      placeholder: helptext.podLogs.tailLines.placeholder,
      value: 500,
      required: true,
    }],
    saveButtonText: helptext.podConsole.choosePod.action,
    customSubmit: this.doPodSelectForLogs,
    afterInit: this.afterLogsDialogInit,
    parent: this,
  };

  readonly ChartReleaseStatus = ChartReleaseStatus;

  constructor(private mdDialog: MatDialog, private appLoaderService: AppLoaderService,
    private dialogService: DialogService, private translate: TranslateService,
    public appService: ApplicationsService, private modalService: ModalService,
    private sysGeneralService: SystemGeneralService, private router: Router,
    private core: CoreService, protected ws: WebSocketService) { }

  ngOnInit(): void {
    this.utils = new CommonUtils();
    this.addChartReleaseChangedEventListner();
  }

  onToolbarAction(evt: CoreEvent): void {
    if (evt.data.event_control == 'filter') {
      this.filterString = evt.data.filter;
      this.filerChartItems();
    } else if (evt.data.event_control == 'bulk') {
      this.onBulkAction(evt.data.bulk.value);
    }
  }

  viewCatalog(): void {
    this.updateTab.emit({ name: ApplicationUserEventName.SwitchTab, value: 0 });
  }

  showLoadStatus(type: EmptyType): void {
    let title = '';
    let message;

    switch (type) {
      case EmptyType.Loading:
        title = helptext.message.loading;
        break;
      case EmptyType.FirstUse:
        title = helptext.message.not_configured;
        break;
      case EmptyType.NoSearchResults:
        title = helptext.message.no_search_result;
        break;
      case EmptyType.NoPageData:
        title = helptext.message.no_installed;
        message = helptext.message.no_installed_message;
        break;
      case EmptyType.Errors:
        title = helptext.message.not_running;
        break;
    }

    this.emptyPageConf.type = type;
    this.emptyPageConf.title = title;
    this.emptyPageConf.message = message;
  }

  getChartItems(): ChartRelease[] {
    return Object.values(this.chartItems);
  }

  addChartReleaseChangedEventListner(): void {
    this.ws.subscribe('chart.release.query').pipe(untilDestroyed(this)).subscribe((evt) => {
      const app = this.chartItems[evt.id];

      if (app && evt && evt.fields) {
        this.chartItems[evt.id] = { ...app, ...evt.fields };
      }
      this.filerChartItems();
    });
  }

  refreshChartReleases(): void {
    this.chartItems = {};
    this.filerChartItems();
    this.showLoadStatus(EmptyType.Loading);
    setTimeout(() => {
      this.updateChartReleases();
    }, 1000);
  }

  updateChartReleases(): void {
    this.appService.getKubernetesConfig().pipe(untilDestroyed(this)).subscribe((res) => {
      if (!res.pool) {
        this.chartItems = {};
        this.showLoadStatus(EmptyType.FirstUse);
      } else {
        this.appService.getKubernetesServiceStarted().pipe(untilDestroyed(this)).subscribe((res) => {
          if (!res) {
            this.chartItems = {};
            this.showLoadStatus(EmptyType.Errors);
          } else {
            this.appService.getChartReleases().pipe(untilDestroyed(this)).subscribe((charts) => {
              this.chartItems = {};

              charts.forEach((chart) => {
                chart.selected = false;
                this.chartItems[chart.name] = chart;
              });

              this.filerChartItems();
            });
          }
        });
      }
    });
  }

  refreshStatus(name: string): void {
    this.appService.getChartReleases(name).pipe(untilDestroyed(this)).subscribe((releases) => {
      const item = this.chartItems[name];
      if (item) {
        item.status = releases[0].status;
        if (item.status === ChartReleaseStatus.Deploying) {
          setTimeout(() => {
            this.refreshStatus(name);
          }, 3000);
        }
      }
    });
  }

  start(name: string): void {
    this.changeReplicaCountJob(name, helptext.starting, 1);
  }

  stop(name: string): void {
    this.changeReplicaCountJob(name, helptext.stopping, 0);
  }

  changeReplicaCountJob(chartName: string, title: string, newReplicaCount: number): void {
    const dialogRef = this.mdDialog.open(EntityJobComponent, {
      data: { title },
    });
    dialogRef.componentInstance.setCall('chart.release.scale', [chartName, { replica_count: newReplicaCount }]);
    dialogRef.componentInstance.submit();
    dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(() => {
      this.dialogService.closeAllDialogs();
      this.refreshStatus(chartName);
    });
    dialogRef.componentInstance.failure.pipe(untilDestroyed(this)).subscribe((error) => {
      new EntityUtils().handleWSError(this, error, this.dialogService);
    });
  }

  portal(chart: ChartRelease): void {
    window.open(chart.portals.web_portal[0]);
  }

  update(name: string): void {
    const catalogApp = this.chartItems[name];
    this.appLoaderService.open();
    this.appService.getUpgradeSummary(name).pipe(untilDestroyed(this)).subscribe((res: UpgradeSummary) => {
      this.appLoaderService.close();

      const dialogRef = this.mdDialog.open(ChartUpgradeDialog, {
        width: '500px',
        maxWidth: '500px',
        data: {
          appInfo: catalogApp,
          upgradeSummary: res,
        } as ChartUpgradeDialogConfig,
        disableClose: false,
      });
      dialogRef.afterClosed().pipe(untilDestroyed(this)).subscribe((version) => {
        if (!version) {
          return;
        }

        this.dialogRef = this.mdDialog.open(EntityJobComponent, {
          data: {
            title: helptext.charts.upgrade_dialog.job,
          },
        });
        this.dialogRef.componentInstance.setCall('chart.release.upgrade', [name, { item_version: version }]);
        this.dialogRef.componentInstance.submit();
        this.dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(() => {
          this.refreshChartReleases();
          this.dialogService.closeAllDialogs();
        });
        this.dialogRef.componentInstance.failure.pipe(untilDestroyed(this)).subscribe((error) => {
          this.dialogService.closeAllDialogs();
          new EntityUtils().handleWSError(this, error, this.dialogService);
        });
      });
    });
  }

  rollback(name: string): void {
    this.rollbackChartName = name;
    this.dialogService.dialogForm(this.rollBackChart, true);
  }

  doRollback(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    const form = entityDialog.formGroup.controls;
    const payload = {
      item_version: form['item_version'].value,
      rollback_snapshot: form['rollback_snapshot'].value,
    };
    self.dialogRef = self.mdDialog.open(EntityJobComponent, {
      data: {
        title: helptext.charts.rollback_dialog.job,
      },
      disableClose: true,
    });
    self.dialogRef.componentInstance.setCall('chart.release.rollback', [self.rollbackChartName, payload]);
    self.dialogRef.componentInstance.submit();
    self.dialogRef.componentInstance.success.pipe(untilDestroyed(self)).subscribe(() => {
      self.refreshChartReleases();
      self.dialogService.closeAllDialogs();
    });
    self.dialogRef.componentInstance.failure.pipe(untilDestroyed(self)).subscribe((error) => {
      self.dialogService.closeAllDialogs();
      new EntityUtils().handleWSError(self, error, self.dialogService);
    });
  }

  edit(name: string): void {
    const catalogApp = this.chartItems[name];
    const chartFormComponent = new ChartFormComponent(
      this.mdDialog,
      this.dialogService,
      this.modalService,
      this.appService,
    );
    if (catalogApp.chart_metadata.name == ixChartApp) {
      chartFormComponent.setTitle(helptext.launch);
    } else {
      chartFormComponent.setTitle(catalogApp.chart_metadata.name);
    }
    this.modalService.open('slide-in-form', chartFormComponent, name);
  }

  getSelectedItems(): string[] {
    const selectedItems: string[] = [];
    this.filteredChartItems.forEach((element) => {
      if (element.selected) {
        selectedItems.push(element.name);
      }
    });
    return selectedItems;
  }

  checkAll(checkedItems: string[]): void {
    let selectAll = true;
    if (checkedItems.length == this.filteredChartItems.length) {
      selectAll = false;
    }

    this.filteredChartItems.forEach((item) => {
      item.selected = selectAll;
    });

    this.refreshToolbarMenus();
  }

  onBulkAction(actionName: string): void {
    const checkedItems = this.getSelectedItems();

    if (actionName === 'select_all') {
      this.checkAll(checkedItems);
    } else if (checkedItems.length > 0) {
      if (actionName === 'delete') {
        this.bulkDelete(checkedItems);
      } else {
        checkedItems.forEach((name) => {
          switch (actionName) {
            case 'start':
              this.start(name);
              break;
            case 'stop':
              this.stop(name);
              break;
          }
        });

        this.translate.get(helptext.bulkActions.finished).pipe(untilDestroyed(this)).subscribe((msg) => {
          this.dialogService.info(helptext.bulkActions.success, msg,
            '500px', 'info', true);
        });
      }
    } else {
      this.translate.get(helptext.bulkActions.no_selected).pipe(untilDestroyed(this)).subscribe((msg) => {
        this.dialogService.errorReport(helptext.bulkActions.error, msg);
      });
    }
  }

  delete(name: string): void {
    this.translate.get(helptext.charts.delete_dialog.msg).pipe(untilDestroyed(this)).subscribe((msg) => {
      this.dialogService.confirm(helptext.charts.delete_dialog.title, msg + name + '?')
        .pipe(untilDestroyed(this)).subscribe((res: boolean) => {
          if (res) {
            this.dialogRef = this.mdDialog.open(EntityJobComponent, {
              data: {
                title: helptext.charts.delete_dialog.job,
              },
              disableClose: true,
            });
            this.dialogRef.componentInstance.setCall('chart.release.delete', [name]);
            this.dialogRef.componentInstance.submit();
            this.dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(() => {
              this.dialogService.closeAllDialogs();
              this.refreshChartReleases();
            });
          }
        });
    });
  }

  bulkDelete(names: string[]): void {
    const name = names.join(',');
    this.translate.get(helptext.charts.delete_dialog.msg).pipe(untilDestroyed(this)).subscribe((msg) => {
      this.dialogService.confirm({
        title: helptext.charts.delete_dialog.title,
        message: msg + name + '?',
      }).pipe(untilDestroyed(this)).subscribe((wasConfirmed) => {
        if (!wasConfirmed) {
          return;
        }

        this.dialogRef = this.mdDialog.open(EntityJobComponent, {
          data: {
            title: helptext.charts.delete_dialog.job,
          },
          disableClose: true,
        });
        this.dialogRef.componentInstance.setCall('core.bulk', ['chart.release.delete', names.map((item) => [item])]);
        this.dialogRef.componentInstance.submit();
        this.dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(
          (res: Job<CoreBulkResponse[]>) => {
            this.dialogService.closeAllDialogs();
            let message = '';
            for (let i = 0; i < res.result.length; i++) {
              if (res.result[i].error != null) {
                message = message + '<li>' + res.result[i].error + '</li>';
              }
            }

            if (message !== '') {
              message = '<ul>' + message + '</ul>';
              this.dialogService.errorReport(helptext.bulkActions.title, message);
            }
            this.modalService.close('slide-in-form');
            this.refreshChartReleases();
          },
        );
      });
    });
  }

  filerChartItems(): void {
    if (this.filterString) {
      this.filteredChartItems = this.getChartItems().filter((chart) => {
        return chart.name.toLowerCase().indexOf(this.filterString.toLocaleLowerCase()) > -1;
      });
    } else {
      this.filteredChartItems = this.getChartItems();
    }

    if (this.filteredChartItems.length == 0) {
      if (this.filterString) {
        this.showLoadStatus(EmptyType.NoSearchResults);
      } else {
        this.showLoadStatus(EmptyType.NoPageData);
      }
    }

    this.refreshToolbarMenus();
  }

  openShell(name: string): void {
    this.podList = [];
    this.podDetails = {};
    this.selectedAppName = name;
    this.appLoaderService.open();
    this.ws.call('chart.release.pod_console_choices', [this.selectedAppName]).pipe(untilDestroyed(this)).subscribe((res) => {
      this.appLoaderService.close();
      this.podDetails = { ...res };
      this.podList = Object.keys(this.podDetails);
      if (this.podList.length == 0) {
        this.dialogService.confirm(helptext.podConsole.nopod.title, helptext.podConsole.nopod.message, true, 'Close', false, null, null, null, null, true);
      } else {
        this.choosePod.fieldConfig[0].value = this.podList[0];
        this.choosePod.fieldConfig[0].options = this.podList.map((item) => ({
          label: item,
          value: item,
        }));
        this.choosePod.fieldConfig[1].value = this.podDetails[this.podList[0]][0];
        this.choosePod.fieldConfig[1].options = this.podDetails[this.podList[0]].map((item) => ({
          label: item,
          value: item,
        }));
        this.dialogService.dialogForm(this.choosePod, true);
      }
    }, () => {
      this.appLoaderService.close();
    });
  }

  openLogs(name: string): void {
    this.podList = [];
    this.podDetails = {};
    this.selectedAppName = name;
    this.appLoaderService.open();
    this.ws.call('chart.release.pod_console_choices', [this.selectedAppName]).pipe(untilDestroyed(this)).subscribe((res) => {
      this.appLoaderService.close();
      this.podDetails = { ...res };
      this.podList = Object.keys(this.podDetails);
      if (this.podList.length == 0) {
        this.dialogService.confirm(helptext.podConsole.nopod.title, helptext.podConsole.nopod.message, true, 'Close', false, null, null, null, null, true);
      } else {
        this.choosePodForLogs.fieldConfig[0].value = this.podList[0];
        this.choosePodForLogs.fieldConfig[0].options = this.podList.map((item) => ({
          label: item,
          value: item,
        }));
        this.choosePodForLogs.fieldConfig[1].value = this.podDetails[this.podList[0]][0];
        this.choosePodForLogs.fieldConfig[1].options = this.podDetails[this.podList[0]].map((item) => ({
          label: item,
          value: item,
        }));
        this.dialogService.dialogForm(this.choosePodForLogs, true);
      }
    }, () => {
      this.appLoaderService.close();
    });
  }

  doPodSelect(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    const pod = entityDialog.formGroup.controls['pods'].value;
    const command = entityDialog.formGroup.controls['command'].value;
    self.router.navigate(new Array('/apps/1/shell/').concat([self.selectedAppName, pod, command]));
    self.dialogService.closeAllDialogs();
  }

  doPodSelectForLogs(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    const pod = entityDialog.formGroup.controls['pods'].value;
    const container = entityDialog.formGroup.controls['containers'].value;
    const tailLines = entityDialog.formGroup.controls['tail_lines'].value;
    self.router.navigate(new Array('/apps/1/logs/').concat([self.selectedAppName, pod, container, tailLines]));
    self.dialogService.closeAllDialogs();
  }

  afterShellDialogInit(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    entityDialog.formGroup.controls['pods'].valueChanges.pipe(untilDestroyed(self)).subscribe((value) => {
      const containers = self.podDetails[value];
      const containerFC = _.find(entityDialog.fieldConfig, { name: 'containers' });
      containerFC.options = containers.map((item) => ({
        label: item,
        value: item,
      }));
      entityDialog.formGroup.controls['containers'].setValue(containers[0]);
    });
  }

  afterLogsDialogInit(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    entityDialog.formGroup.controls['pods'].valueChanges.pipe(untilDestroyed(self)).subscribe((value) => {
      const containers = self.podDetails[value];
      const containerFC = _.find(entityDialog.fieldConfig, { name: 'containers' });
      containerFC.options = containers.map((item) => ({
        label: item,
        value: item,
      }));
      entityDialog.formGroup.controls['containers'].setValue(containers[0]);
    });
  }

  showChartEvents(name: string): void {
    const catalogApp = this.chartItems[name];
    if (catalogApp) {
      this.mdDialog.open(ChartEventsDialog, {
        width: '686px',
        maxWidth: '686px',
        data: catalogApp,
        disableClose: false,
      });
    }
  }

  // On click checkbox
  onChangeCheck(): void {
    this.refreshToolbarMenus();
  }

  // Refresh Toolbar menus
  refreshToolbarMenus(): void {
    const isSelectedOneMore: boolean = this.getSelectedItems().length > 0;
    const isSelectedAll = !this.filteredChartItems.find((item) => !item.selected);
    this.updateTab.emit({ name: ApplicationUserEventName.UpdateToolbar, value: isSelectedOneMore, isSelectedAll });
  }
}
