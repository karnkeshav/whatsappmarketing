import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API, timeout: 30000 });

export const REGIONS = ["Hyderabad", "Bihar", "Delhi", "Jharkhand"];

export const listGroups = (region = "all") =>
  api.get("/groups", { params: { region } }).then(r => r.data);

export const getStats = () => api.get("/groups/stats").then(r => r.data);

export const getScanStatus = () => api.get("/scan/status").then(r => r.data);

export const startDiscovery = (regions = REGIONS, category = "jobs") =>
  api.post("/groups/discover", { regions, category, max_per_region: 10 }).then(r => r.data);

export const submitGroup = (invite_link, region) =>
  api.post("/groups/submit", { invite_link, region }).then(r => r.data);

export const reportGroup = (id, kind) =>
  api.post(`/groups/${id}/report`, { kind }).then(r => r.data);
