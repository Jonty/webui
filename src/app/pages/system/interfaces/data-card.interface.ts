import { Option } from 'app/interfaces/option.interface';
import { EmptyConfig } from 'app/pages/common/entity/entity-empty/entity-empty.component';
import { AppTableConfig } from 'app/pages/common/entity/table/table.component';

export interface DataCard {
  title: string;
  id: string;
  items?: Option[];
  tableConf?: AppTableConfig;

  // TODO: May be unused.
  actions?: (Option & { icon: string })[];
  emptyConf?: EmptyConfig;
}
