import {
  Component, OnInit, Output, EventEmitter,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslateService } from '@ngx-translate/core';
import { JobsManagerStore } from 'app/components/common/dialog/jobs-manager/jobs-manager.store';
import {
  chartsTrain, ixChartApp, officialCatalog, appImagePlaceholder,
} from 'app/constants/catalog.constants';
import { CommonUtils } from 'app/core/classes/common-utils';
import { CoreService } from 'app/core/services/core-service/core.service';
import { JobState } from 'app/enums/job-state.enum';
import helptext from 'app/helptext/apps/apps';
import { ApplicationUserEventName } from 'app/interfaces/application.interface';
import { CatalogApp } from 'app/interfaces/catalog.interface';
import { CoreEvent } from 'app/interfaces/events';
import { Job } from 'app/interfaces/job.interface';
import { KubernetesConfig } from 'app/interfaces/kubernetes-config.interface';
import { Option } from 'app/interfaces/option.interface';
import { DialogFormConfiguration } from 'app/pages/common/entity/entity-dialog/dialog-form-configuration.interface';
import { EntityDialogComponent } from 'app/pages/common/entity/entity-dialog/entity-dialog.component';
import { EmptyConfig, EmptyType } from 'app/pages/common/entity/entity-empty/entity-empty.component';
import { EntityJobComponent } from 'app/pages/common/entity/entity-job/entity-job.component';
import { EntityUtils } from 'app/pages/common/entity/utils';
import { AppLoaderService } from 'app/services/app-loader/app-loader.service';
import { DialogService, WebSocketService } from 'app/services/index';
import { ModalService } from 'app/services/modal.service';
import { ApplicationsService } from '../applications.service';
import { CatalogSummaryDialog } from '../dialogs/catalog-summary/catalog-summary-dialog.component';
import { ChartWizardComponent } from '../forms/chart-wizard.component';
import { KubernetesSettingsComponent } from '../forms/kubernetes-settings.component';

interface CatalogSyncJob {
  id: number;
  name: string;
  progress: number;
}

@UntilDestroy()
@Component({
  selector: 'app-catalog',
  templateUrl: './catalog.component.html',
  styleUrls: ['../applications.component.scss', 'catalog.component.scss'],
})
export class CatalogComponent implements OnInit {
  @Output() updateTab = new EventEmitter();

  catalogApps: CatalogApp[] = [];
  catalogNames: string[] = [];
  filteredCatalogNames: string[] = [];
  filteredCatalogApps: CatalogApp[] = [];
  filterString = '';
  catalogSyncJobs: CatalogSyncJob[] = [];
  private poolList: Option[] = [];
  private selectedPool = '';
  private kubernetesForm: KubernetesSettingsComponent;
  private chartWizardComponent: ChartWizardComponent;

  protected utils: CommonUtils;
  imagePlaceholder = appImagePlaceholder;
  private noAvailableCatalog = true;
  isLoading = false;
  emptyPageConf: EmptyConfig = {
    type: EmptyType.Loading,
    large: true,
    title: helptext.catalogMessage.loading,
  };

  choosePool: DialogFormConfiguration = {
    title: helptext.choosePool.title,
    fieldConfig: [{
      type: 'select',
      name: 'pools',
      placeholder: helptext.choosePool.placeholder,
      required: true,
      options: this.poolList,
    }],
    method_ws: 'kubernetes.update',
    saveButtonText: helptext.choosePool.action,
    customSubmit: this.doPoolSelect,
    parent: this,
  };

  constructor(
    private dialogService: DialogService,
    private appLoaderService: AppLoaderService,
    private mdDialog: MatDialog,
    private translate: TranslateService,
    private ws: WebSocketService,
    private router: Router,
    private core: CoreService,
    private modalService: ModalService,
    private appService: ApplicationsService,
    private store: JobsManagerStore,
  ) {
    this.utils = new CommonUtils();
  }

  ngOnInit(): void {
    this.loadCatalogs();
    this.checkForConfiguredPool();
    this.refreshForms();
    this.modalService.refreshForm$.pipe(untilDestroyed(this)).subscribe(() => {
      this.refreshForms();
    });

    this.store.state$.pipe(untilDestroyed(this)).subscribe((state) => {
      const syncJobs = state.jobs.filter((job) => job.method == 'catalog.create' && job.state === JobState.Running);
      syncJobs.forEach((syncJob) => {
        const catalogSyncJob = this.catalogSyncJobs.find((job) => job.id == syncJob.id);
        if (!catalogSyncJob) {
          this.catalogSyncJobs.push({
            id: syncJob.id,
            name: (syncJob.arguments[0] as any).label,
            progress: syncJob.progress.percent,
          });
        }
      });
    });

    this.ws.subscribe('core.get_jobs').pipe(untilDestroyed(this)).subscribe((event) => {
      if (event.fields.method == 'catalog.create') {
        let catalogSyncJob = this.catalogSyncJobs.find((job) => job.id == event.fields.id);
        if (!catalogSyncJob) {
          catalogSyncJob = {
            id: event.fields.id,
            name: event.fields.arguments[0] as string,
            progress: event.fields.progress.percent,
          };
          this.catalogSyncJobs.push(catalogSyncJob);
        }
        catalogSyncJob.progress = event.fields.progress.percent;
        if (event.fields.state == JobState.Success) {
          this.catalogSyncJobs = this.catalogSyncJobs.filter((job) => job.id !== catalogSyncJob.id);
          this.loadCatalogs();
        } else if (event.fields.state == JobState.Failed) {
          this.catalogSyncJobs = this.catalogSyncJobs.filter((job) => job.id !== catalogSyncJob.id);
        }
      }
    });
  }

  loadCatalogs(): void {
    this.catalogNames = [];
    this.catalogApps = [];
    this.isLoading = true;
    this.showLoadStatus(EmptyType.Loading);

    this.appService.getAllCatalogItems().pipe(untilDestroyed(this)).subscribe((catalogs) => {
      this.noAvailableCatalog = true;
      for (let i = 0; i < catalogs.length; i++) {
        const catalog = catalogs[i];

        if (!catalog.error) {
          this.noAvailableCatalog = false;
          this.catalogNames.push(catalog.label);
          catalog.preferred_trains.forEach((train) => {
            for (const i in catalog.trains[train]) {
              const item = catalog.trains[train][i];

              const catalogItem = { ...item } as CatalogApp;
              catalogItem.catalog = {
                id: catalog.id,
                label: catalog.label,
                train,
              };
              this.catalogApps.push(catalogItem);
            }
          });
        }
      }

      this.refreshToolbarMenus();
      this.filterApps();
      this.isLoading = false;
    });
  }

  showLoadStatus(type: EmptyType): void {
    let title = '';
    let message;

    if (this.isLoading) {
      type = EmptyType.Loading;
    }

    switch (type) {
      case EmptyType.Loading:
        title = helptext.catalogMessage.loading;
        break;
      case EmptyType.NoPageData:
        if (this.noAvailableCatalog) {
          title = helptext.catalogMessage.no_catalog;
        } else {
          title = helptext.catalogMessage.no_application;
        }
        break;
      case EmptyType.NoSearchResults:
        title = helptext.catalogMessage.no_search_result;
        break;
    }

    this.emptyPageConf.type = type;
    this.emptyPageConf.title = title;
    this.emptyPageConf.message = message;
  }

  onToolbarAction(evt: CoreEvent): void {
    if (evt.data.event_control == 'settings' && evt.data.settings) {
      switch (evt.data.settings.value) {
        case 'select_pool':
          return this.selectPool();
        case 'advanced_settings':
          this.modalService.open('slide-in-form', this.kubernetesForm);
          break;
        case 'unset_pool':
          this.doUnsetPool();
          break;
      }
    } else if (evt.data.event_control == 'launch') {
      this.doInstall(ixChartApp);
    } else if (evt.data.event_control == 'filter') {
      this.filterString = evt.data.filter;
      this.filterApps();
    } else if (evt.data.event_control == 'refresh_all') {
      this.syncAll();
    } else if (evt.data.event_control == 'catalogs') {
      this.filteredCatalogNames = evt.data.catalogs.map((catalog: Option) => catalog.value);

      this.filterApps();
    }
  }

  refreshToolbarMenus(): void {
    this.updateTab.emit({
      name: ApplicationUserEventName.CatalogToolbarChanged,
      value: Boolean(this.selectedPool),
      catalogNames: this.catalogNames,
    });
  }

  refreshForms(): void {
    this.kubernetesForm = new KubernetesSettingsComponent(
      this.ws,
      this.appLoaderService,
      this.dialogService,
      this.modalService,
      this.appService,
    );
    this.chartWizardComponent = new ChartWizardComponent(
      this.mdDialog,
      this.dialogService,
      this.modalService,
      this.appService,
    );
  }

  checkForConfiguredPool(): void {
    this.appService.getKubernetesConfig().pipe(untilDestroyed(this)).subscribe((config) => {
      if (!config.pool) {
        this.selectPool();
      } else {
        this.selectedPool = config.pool;
      }
      this.refreshToolbarMenus();
    });
  }

  selectPool(): void {
    this.appService.getPoolList().pipe(untilDestroyed(this)).subscribe((pools) => {
      if (pools.length === 0) {
        this.dialogService.confirm({
          title: helptext.noPool.title,
          message: helptext.noPool.message,
          hideCheckBox: true,
          buttonMsg: helptext.noPool.action,
        }).pipe(untilDestroyed(this)).subscribe((confirmed) => {
          if (!confirmed) {
            return;
          }
          this.router.navigate(['storage', 'manager']);
        });
      } else {
        this.poolList.length = 0;
        pools.forEach((pool) => {
          this.poolList.push({ label: pool.name, value: pool.name });
        });
        if (this.selectedPool) {
          this.choosePool.fieldConfig[0].value = this.selectedPool;
        } else {
          delete this.choosePool.fieldConfig[0].value;
        }

        this.dialogService.dialogForm(this.choosePool, true);
      }
    });
  }

  doUnsetPool(): void {
    this.dialogService.confirm({
      title: helptext.choosePool.unsetPool.confirm.title,
      message: helptext.choosePool.unsetPool.confirm.message,
      hideCheckBox: true,
      buttonMsg: helptext.choosePool.unsetPool.confirm.button,
    }).pipe(untilDestroyed(this)).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      const dialogRef = this.mdDialog.open(EntityJobComponent, {
        data: {
          title: helptext.choosePool.jobTitle,
        },
        disableClose: true,
      });
      dialogRef.componentInstance.setCall('kubernetes.update', [{ pool: null }]);
      dialogRef.componentInstance.submit();
      dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(() => {
        this.dialogService.closeAllDialogs();
        this.selectedPool = null;
        this.refreshToolbarMenus();
        this.translate.get(helptext.choosePool.unsetPool.label).pipe(untilDestroyed(this)).subscribe((msg) => {
          this.dialogService.info(helptext.choosePool.success, msg,
            '500px', 'info', true);
        });
      });

      dialogRef.componentInstance.failure.pipe(untilDestroyed(this)).subscribe((err) => {
        new EntityUtils().handleWSError(self, err, this.dialogService);
      });
    });
  }

  doPoolSelect(entityDialog: EntityDialogComponent<this>): void {
    const self = entityDialog.parent;
    const pool = entityDialog.formGroup.controls['pools'].value;
    const dialogRef = self.mdDialog.open(EntityJobComponent, {
      data: {
        title: (helptext.choosePool.jobTitle),
      },
      disableClose: true,
    });
    dialogRef.componentInstance.setCall('kubernetes.update', [{ pool }]);
    dialogRef.componentInstance.submit();
    dialogRef.componentInstance.success.pipe(untilDestroyed(self)).subscribe((res: Job<KubernetesConfig>) => {
      self.selectedPool = pool;
      self.refreshToolbarMenus();
      self.dialogService.closeAllDialogs();
      self.translate.get(helptext.choosePool.message).pipe(untilDestroyed(self)).subscribe((msg: string) => {
        self.dialogService.info(helptext.choosePool.success, msg + res.result.pool,
          '500px', 'info', true);
      });
    });
    dialogRef.componentInstance.failure.pipe(untilDestroyed(self)).subscribe((err) => {
      new EntityUtils().handleWSError(self, err, self.dialogService);
    });
  }

  doInstall(name: string, catalog = officialCatalog, train = chartsTrain): void {
    this.appLoaderService.open();
    this.appService.getCatalogItem(name, catalog, train).pipe(untilDestroyed(this)).subscribe((catalogApp) => {
      this.appLoaderService.close();

      if (catalogApp) {
        const catalogAppInfo = { ...catalogApp } as CatalogApp;
        catalogAppInfo.catalog = {
          id: catalog,
          train,
        };
        catalogAppInfo.schema = catalogApp.versions[catalogApp.latest_version].schema;

        this.chartWizardComponent.setCatalogApp(catalogAppInfo);
        this.modalService.open('slide-in-form', this.chartWizardComponent);
      }
    });
  }

  filterApps(): void {
    if (this.filterString) {
      this.filteredCatalogApps = this.catalogApps.filter((app) => {
        return app.name.toLowerCase().indexOf(this.filterString.toLocaleLowerCase()) > -1;
      });
    } else {
      this.filteredCatalogApps = this.catalogApps;
    }

    this.filteredCatalogApps = this.filteredCatalogApps.filter((app) =>
      this.filteredCatalogNames.includes(app.catalog.label) && app.name !== ixChartApp);

    if (this.filteredCatalogApps.length == 0) {
      if (this.filterString) {
        this.showLoadStatus(EmptyType.NoSearchResults);
      } else {
        this.showLoadStatus(EmptyType.NoPageData);
      }
    }
  }

  showSummaryDialog(name: string, catalog = officialCatalog, train = chartsTrain): void {
    this.appLoaderService.open();
    this.appService.getCatalogItem(name, catalog, train).pipe(untilDestroyed(this)).subscribe((catalogApp) => {
      this.appLoaderService.close();
      if (catalogApp) {
        const catalogAppInfo = { ...catalogApp } as CatalogApp;
        catalogAppInfo.catalog = {
          label: catalog,
          train,
        };
        this.mdDialog.open(CatalogSummaryDialog, {
          width: '470px',
          data: catalogAppInfo,
          disableClose: false,
        });
      }
    });
  }

  syncAll(): void {
    const dialogRef = this.mdDialog.open(EntityJobComponent, {
      data: {
        title: helptext.installing,
      },
      disableClose: true,
    });
    dialogRef.componentInstance.setCall('catalog.sync_all');
    dialogRef.componentInstance.submit();
    dialogRef.componentInstance.success.pipe(untilDestroyed(this)).subscribe(() => {
      this.dialogService.closeAllDialogs();
      this.loadCatalogs();
    });
  }
}
