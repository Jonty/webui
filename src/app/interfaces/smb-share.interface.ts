import { SmbSharesecPermission, SmbSharesecType } from 'app/enums/smb-sharesec.enum';

export interface SmbShare {
  aapl_name_mangling: boolean;
  abe: boolean;
  acl: boolean;
  auxsmbconf: string;
  browsable: boolean;
  cluster_volname: string;
  comment: string;
  durablehandle: boolean;
  enabled: boolean;
  fsrvp: boolean;
  guestok: boolean;
  home: boolean;
  hostsallow: string[];
  hostsdeny: string[];
  id: number;
  locked: boolean;
  name: string;
  path: string;
  path_suffix: string;
  purpose: string; // Possibly enum: "DEFAULT_SHARE"
  recyclebin: boolean;
  ro: boolean;
  shadowcopy: boolean;
  streams: boolean;
  timemachine: boolean;
  vuid: string;
}

export interface SmbPreset {
  verbose_name: string;
  params: Partial<SmbShare>;
}

export interface SmbPresets {
  [name: string]: SmbPreset;
}

export interface SmbSharesec {
  id: number;
  share_acl: SmbSharesecAce[];
  share_name: string;
}

export interface SmbSharesecAce {
  ae_perm: SmbSharesecPermission;
  ae_type: SmbSharesecType;
  ae_who_name: {
    domain: string;
    name: string;
    sidtype: string;
  };
  ae_who_sid: string;
}
