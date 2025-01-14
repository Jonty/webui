import { ChartSchemaGroup, ChartSchemaNode } from 'app/interfaces/chart-release.interface';
import { QueryParams } from 'app/interfaces/query-api.interface';

export interface Catalog {
  branch: string;
  builtin: boolean;
  healthy: boolean;
  id: string;
  label: string;

  /**
   * E.g. "/mnt/pool/ix-applications/catalogs/github_com_truenas_charts_git_master"
   */
  location: string;
  preferred_trains: string[];

  /**
   * E.g. https://github.com/truenas/charts.git
   */
  repository: string;
  trains: {
    [trainName: string]: CatalogTrain;
  };
  error: boolean;
}

export type CatalogQueryParams = QueryParams<Catalog, {
  extra: {
    item_details?: boolean;
    cache?: boolean;
    retrieve_versions?: boolean;
    include_chart_schema?: boolean;
  };
}>;

export interface CatalogTrain {
  [application: string]: CatalogApp;
}

export interface CatalogApp {
  app_readme: string;
  categories: string[];
  healthy: boolean;
  healthy_error: string;
  icon_url: string;
  location: string;
  name: string;
  latest_version: string;
  latest_app_version: string;
  latest_human_version: string;
  versions: { [version: string]: CatalogAppVersion };
  catalog?: {
    id?: string;
    label?: string;
    train: string;
  };
  schema?: any;
}

export interface CatalogAppVersion {
  app_readme: string;
  changelog: string;
  chart_metadata: ChartMetadata;
  detailed_readme: string;
  healthy: boolean;
  healthy_error: string;
  human_version: string;
  location: string;
  required_features: string[];
  schema: {
    groups: ChartSchemaGroup[];
    questions: ChartSchemaNode[];
    portals: {
      web_portal: {
        host: string[];
        ports: string[];
        protocols: string[];
      };
    };
  };
  supported: boolean;
  values: any;
  version: string;
  train?: string;
  app?: string;
}

export interface ChartMetadata {
  apiVersion: string;
  appVersion: string;
  dependencies: ChartMetadataDependency[];
  latest_chart_version: string;
  description: string;
  home: string;
  icon: string;
  keywords: string[];
  name: string;
  sources: string[];
  version: string;
}

export interface ChartMetadataDependency {
  name: string;
  repository: string;
  version: string;
}

export interface CatalogItems {
  [train: string]: CatalogTrain;
}
