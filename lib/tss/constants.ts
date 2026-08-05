export const TSS_BASE_URL =
  "https://tss.ucsd.edu/sap/opu/odata4/sap/yucsd_con_module_sb/srvd/sap/yucsd_con_module_servicedef/0001";

export const TSS_APPT_BASE_URL =
  "https://tss.ucsd.edu/sap/opu/odata4/sap/ysb_appttime/srvd/sap/ysd_appttimes/0001";

export const SAP_CLIENT = "500";

export { getCurrentTerm as defaultTerm } from "./terms";

export const TSS_TIMEOUT_MS = 10_000;
export const COURSE_RESULT_LIMIT = 30;

export const SESSION_COOKIE_NAME = "ucsd_planner_session";
export const SESSION_TTL_SECONDS = 30 * 60;
