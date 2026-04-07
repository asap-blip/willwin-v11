'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ServicesTab } from './ServicesTab'
import { TeamTab } from './TeamTab'
import { HoursTab } from './HoursTab'

export function SettingsView() {
  return (
    <Tabs defaultValue="services">
      <TabsList>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="hours">Hours &amp; Availability</TabsTrigger>
      </TabsList>

      <TabsContent value="services">
        <ServicesTab />
      </TabsContent>

      <TabsContent value="team">
        <TeamTab />
      </TabsContent>

      <TabsContent value="hours">
        <HoursTab />
      </TabsContent>
    </Tabs>
  )
}
