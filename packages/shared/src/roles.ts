/** Peran pengguna aplikasi. */
export const APP_ROLES = ['upps', 'sek_adm', 'sek_keu', 'kea', 'asesor', 'majelis'] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Peran yang ditanam sebagai atribut `role` pada sertifikat Fabric CA. Sek. Keu. tidak memiliki identitas Fabric. */
export const FABRIC_ROLES = ['upps', 'sek_adm', 'kea', 'asesor', 'majelis', 'audit'] as const;
export type FabricRole = (typeof FABRIC_ROLES)[number];

export const MSP_IDS = {
  upps: 'UPPSMSP',
  sekretariat: 'SekretariatMSP',
  kea: 'KEAMSP',
  asesor: 'AsesorMSP',
  majelis: 'MajelisMSP',
} as const;
export type MspId = (typeof MSP_IDS)[keyof typeof MSP_IDS];

/** Pasangan sah peran Fabric → MSP. Chaincode menolak kombinasi lain. */
export const FABRIC_ROLE_MSP: Record<FabricRole, MspId> = {
  upps: MSP_IDS.upps,
  sek_adm: MSP_IDS.sekretariat,
  kea: MSP_IDS.kea,
  asesor: MSP_IDS.asesor,
  majelis: MSP_IDS.majelis,
  audit: MSP_IDS.sekretariat,
};

/** Peran aplikasi → peran Fabric (null = tidak menulis ke chain). */
export const APP_TO_FABRIC_ROLE: Record<AppRole, FabricRole | null> = {
  upps: 'upps',
  sek_adm: 'sek_adm',
  sek_keu: null,
  kea: 'kea',
  asesor: 'asesor',
  majelis: 'majelis',
};

export const AUDIT_SERVICE_UID = 'audit-service';

export const ROLE_LABEL: Record<AppRole, string> = {
  upps: 'UPPS',
  sek_adm: 'Sekretariat Administrasi',
  sek_keu: 'Sekretariat Keuangan',
  kea: 'Komite Evaluasi dan Akreditasi',
  asesor: 'Asesor',
  majelis: 'Majelis Akreditasi',
};

export const ROLE_HOME: Record<AppRole, string> = {
  upps: '/upps',
  sek_adm: '/sekretariat/administrasi',
  sek_keu: '/sekretariat/keuangan',
  kea: '/kea',
  asesor: '/asesor',
  majelis: '/majelis',
};
