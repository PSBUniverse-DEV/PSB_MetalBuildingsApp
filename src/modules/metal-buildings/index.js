const metalBuildingsModule = {
  key: "metal-buildings",
  module_key: "metal-app",
  name: "Metal Buildings",
  description: "Configurator pricing engine for metal building structures.",
  icon: "bi-building",
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,
  routes: [
    { path: "/metal-buildings", page: "ConfiguratorPage" },
    { path: "/metal-buildings/v2", page: "ConfiguratorPageV2" },
    { path: "/metal-buildings/v1", page: "ConfiguratorPageV1" },
    { path: "/metal-buildings/pricing", page: "PricingPage" },
    { path: "/metal-buildings/order-form", page: "OrderFormPage" },
    { path: "/metal-buildings/master-data-config", page: "MetalMasterDataConfigPage" },
  ],
};

export default metalBuildingsModule;