'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ServicesTab } from './ServicesTab'
import { TeamTab } from './TeamTab'

export function SettingsView() {
  return (
    <Tabs defaultValue="services">
      <TabsList>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>

      <TabsContent value="services">
        <ServicesTab />
      </TabsContent>

      <TabsContent value="team">
        <TeamTab />
      </TabsContent>
    </Tabs>
  )
}
