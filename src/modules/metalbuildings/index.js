const appIdFromEnv = Number(process.env.METAL_BUILDINGS_APP_ID);
const appId = Number.isFinite(appIdFromEnv) ? appIdFromEnv : 1;

const metalbuildingsModule = {
  key: "metal-buildings",
  app_id: appId,
  name: "Metal Buildings",
  description: "Manage metal building projects and resources.",
  icon: "bi-diagram-3",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 120,
  routes: [
    { path: "/admin/metal-buildings", page: "metal-buildings" },
  ],
};

export default metalbuildingsModule;
