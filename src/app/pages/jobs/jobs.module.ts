import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FlexLayoutModule } from '@angular/flex-layout';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { MaterialModule } from 'app/app-material.module';
import { CoreComponents } from 'app/core/components/core-components.module';
import { EntityModule } from 'app/pages/common/entity/entity.module';
import { routing } from 'app/pages/jobs/jobs.routing';
import { JobLogsSidebarComponent } from './components/job-logs-sidebar/job-logs-sidebar.component';
import { JobsListComponent } from './jobs-list/jobs-list.component';
import { JobsListStore } from './jobs-list/jobs-list.store';

@NgModule({
  declarations: [JobsListComponent, JobLogsSidebarComponent],
  imports: [
    CoreComponents,
    EntityModule,
    CommonModule,
    FormsModule,
    TranslateModule,
    ReactiveFormsModule,
    routing,
    MaterialModule,
    FlexLayoutModule,
  ],
  providers: [
    JobsListStore,
  ],
})
export class JobsModule { }
