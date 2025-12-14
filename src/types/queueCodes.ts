export enum ConsumeCode {
  OK = 1,
  ModelRpmExceeded = -1,
  ModelRpdExceeded = -2,
  UserRpdExceeded = -3,
}

export enum AcquireCode {
  OK = 1,
  ConcurrencyExceeded = 0,
  ModelRpdExceeded = -2,
  UserRpdExceeded = -4,
}
