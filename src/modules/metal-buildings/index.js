const metalBuildingsModule = {
  key: "metal-buildings",
  module_key: "psbuniverse",
  name: "Metal Buildings",
  description: "Configurator pricing engine for metal building structures.",
  icon: "bi-building",
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,
  routes: [
    { path: "/metal-buildings", page: "ConfiguratorPage" },
    { path: "/metal-buildings/pricing", page: "PricingPage" },
  ],
};

export default metalBuildingsModule;
