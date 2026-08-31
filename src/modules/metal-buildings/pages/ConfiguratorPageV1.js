import { connection } from "next/server";
import { loadConfiguratorData } from "../data/metalBuildings.actions";
import ConfiguratorViewV1 from "./ConfiguratorViewV1";

export default async function ConfiguratorPageV1() {
  await connection();
  const data = await loadConfiguratorData();
  return <ConfiguratorViewV1 data={data} />;
}