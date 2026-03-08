import { ComponentType, lazy } from "react";

export interface PluginDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  route: string;
  component: ComponentType;
  permissions?: string[];
  enabled: boolean;
}

class PluginRegistry {
  private plugins: Map<string, PluginDefinition> = new Map();

  register(plugin: PluginDefinition) {
    this.plugins.set(plugin.id, plugin);
  }

  unregister(id: string) {
    this.plugins.delete(id);
  }

  get(id: string) {
    return this.plugins.get(id);
  }

  getAll(): PluginDefinition[] {
    return Array.from(this.plugins.values());
  }

  getEnabled(): PluginDefinition[] {
    return this.getAll().filter((p) => p.enabled);
  }
}

export const pluginRegistry = new PluginRegistry();
