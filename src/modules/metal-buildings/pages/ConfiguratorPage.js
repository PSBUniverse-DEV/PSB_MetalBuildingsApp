import { connection } from "next/server";
import { loadConfiguratorData } from "../data/metalBuildings.actions";
import ConfiguratorView from "./ConfiguratorView";

export default async function ConfiguratorPage() {
  await connection();
  const data = await loadConfiguratorData();
  return <ConfiguratorView data={data} />;
}
