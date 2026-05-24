'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ServicesTab } from './ServicesTab'
import { TeamTab } from './TeamTab'
import { HoursTab } from './HoursTab'
import { GeneralTab } from './GeneralTab'

export function SettingsView() {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="services">Services</TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
        <TabsTrigger value="hours">Hours &amp; Availability</TabsTrigger>
      </TabsList>

      <TabsContent value="general" keepMounted>
        <GeneralTab />
      </TabsContent>

      <TabsContent value="services" keepMounted>
        <ServicesTab />
      </TabsContent>

      <TabsContent value="team" keepMounted>
        <TeamTab />
      </TabsContent>

      <TabsContent value="hours" keepMounted>
        <HoursTab />
      </TabsContent>
    </Tabs>
  )
}
