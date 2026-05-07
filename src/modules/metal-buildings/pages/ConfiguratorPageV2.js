import { connection } from "next/server";
import { loadConfiguratorData } from "../data/metalBuildings.actions";
import ConfiguratorViewV2 from "./ConfiguratorViewV2";

export default async function ConfiguratorPageV2() {
  await connection();
  const data = await loadConfiguratorData();
  return <ConfiguratorViewV2 data={data} />;
}
