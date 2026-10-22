import { createContext, type ReactNode, useContext, useRef, useState } from 'react'

export const ORGANIZATION_ROLES = ['Reader', 'Editor', 'Reviewer', 'Administrator'] as const
export type OrganizationRole = typeof ORGANIZATION_ROLES[number]
export type PersonStatus = 'Active' | 'Invited' | 'Paused'
export interface OrganizationPerson {
  id: string
  name: string
  email: string
  status: PersonStatus
  teamIds: string[]
  role: OrganizationRole
  title: string
  bio: string
  notifications: boolean
}
export interface OrganizationVendor { id: string; name: string; ownerId: string; email: string; phone: string; website: string; description: string }
export interface OrganizationContact { id: string; name: string; vendorId: string; title: string; email: string; phone: string }
const seedVendors: OrganizationVendor[] = [{ id: 'northstar', name: 'Northstar Supply', ownerId: 'gabriel', email: 'hello@northstar.example.test', phone: '', website: 'northstar.example.test', description: 'Fictional vendor for exploring company and contact relationships.' }]
const seedContacts: OrganizationContact[] = [{ id: 'morgan-northstar', name: 'Morgan Ellis', vendorId: 'northstar', title: 'Account contact', email: 'morgan@northstar.example.test', phone: '' }]
export interface OrganizationTeam { id: string; name: string; description: string }
const seedTeams: OrganizationTeam[] = [
  { id: 'company', name: 'Company Knowledge', description: 'Shared guides and everyday company information.' },
  { id: 'hr', name: 'HR', description: 'People operations and team onboarding examples.' },
  { id: 'marketing', name: 'Marketing', description: 'Campaign planning, content and source material.' },
  { id: 'it', name: 'IT', description: 'Connected tools, support and system planning.' },
  { id: 'sales', name: 'Sales', description: 'Sales playbooks and customer work examples.' },
]
function initialPeople(): OrganizationPerson[] {
  return [
    { id: 'alex', name: 'Alex Morgan', teamIds: ['company', 'sales'], role: 'Reader', title: 'Knowledge coordinator' },
    { id: 'jordan', name: 'Jordan Lee', teamIds: ['company', 'hr'], role: 'Reviewer', title: 'People operations lead' },
    { id: 'sam', name: 'Sam Rivera', teamIds: ['company', 'marketing'], role: 'Editor', title: 'Marketing specialist' },
    { id: 'taylor', name: 'Taylor Chen', teamIds: ['it'], role: 'Administrator', title: 'Workspace administrator' },
    { id: 'gabriel', name: 'Gabriel', teamIds: ['company'], role: 'Reader', title: 'Chief Operating Officer (COO)' },
    { id: 'casey', name: 'Casey Patel', teamIds: ['company'], role: 'Reviewer', title: 'Knowledge reviewer' },
  ].map(person => ({ ...person, role: person.role as OrganizationRole, email: `${person.id}@example.test`, status: 'Active', bio: 'Fictional colleague for exploring this portfolio preview.', notifications: true }))
}
interface OrganizationContextValue {
  people: OrganizationPerson[]
  teams: OrganizationTeam[]
  vendors: OrganizationVendor[]
  contacts: OrganizationContact[]
  updateProfile: (id: string, patch: Pick<OrganizationPerson, 'title' | 'bio' | 'notifications'>) => void
  invitePerson: (name: string, email: string, teamId: string, role: OrganizationRole) => string | null
  setPersonStatus: (id: string, status: PersonStatus) => void
  setPersonRole: (id: string, role: OrganizationRole) => void
  setMembership: (id: string, teamId: string, joined: boolean) => void
  addTeam: (name: string, description: string) => string | null
  resetOrganization: () => void
}
const OrganizationContext = createContext<OrganizationContextValue | null>(null)
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState(initialPeople)
  const [teams, setTeams] = useState(() => seedTeams.map(team => ({ ...team })))
  const [vendors] = useState(() => seedVendors.map(vendor => ({ ...vendor })))
  const [contacts] = useState(() => seedContacts.map(contact => ({ ...contact })))
  const nextId = useRef(1)
  function updateProfile(id: string, patch: Pick<OrganizationPerson, 'title' | 'bio' | 'notifications'>) {
    setPeople(items => items.map(person => person.id === id ? { ...person, ...patch } : person))
  }
  function invitePerson(name: string, email: string, teamId: string, role: OrganizationRole) {
    if (!name.trim() || !email.trim() || !teams.some(team => team.id === teamId) || !ORGANIZATION_ROLES.includes(role)) return 'Complete the sample name, email, team and role.'
    if (people.some(person => person.email.toLowerCase() === email.trim().toLowerCase())) return 'That sample email is already in the directory.'
    if (people.some(person => person.name.trim().toLowerCase() === name.trim().toLowerCase())) return 'That sample name is already in the directory. Use a different name so task owners stay clear.'
    const id = `sample-person-${nextId.current++}`
    setPeople(items => [...items, { id, name: name.trim(), email: email.trim(), teamIds: [teamId], role, status: 'Invited', title: 'Sample invited colleague', bio: '', notifications: false }])
    return null
  }
  function setPersonStatus(id: string, status: PersonStatus) {
    setPeople(items => items.map(person => person.id === id ? { ...person, status } : person))
  }
  function setPersonRole(id: string, role: OrganizationRole) {
    if (!ORGANIZATION_ROLES.includes(role)) return
    setPeople(items => items.map(person => person.id === id ? { ...person, role } : person))
  }
  function setMembership(id: string, teamId: string, joined: boolean) {
    if (!teams.some(team => team.id === teamId)) return
    setPeople(items => items.map(person => person.id === id ? { ...person, teamIds: joined ? [...new Set([...person.teamIds, teamId])] : person.teamIds.filter(value => value !== teamId) } : person))
  }
  function addTeam(name: string, description: string) {
    if (!name.trim()) return 'Give this sample team a name.'
    if (teams.some(team => team.name.toLowerCase() === name.trim().toLowerCase())) return 'A sample team already has that name.'
    setTeams(items => [...items, { id: `sample-team-${nextId.current++}`, name: name.trim(), description: description.trim() }])
    return null
  }
  return <OrganizationContext.Provider value={{ people, teams, vendors, contacts, updateProfile, invitePerson, setPersonStatus, setPersonRole, setMembership, addTeam, resetOrganization: () => { setPeople(initialPeople()); setTeams(seedTeams.map(team => ({ ...team }))); nextId.current = 1 } }}>{children}</OrganizationContext.Provider>
}
export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) throw new Error('OrganizationProvider must wrap the preview.')
  return context
}
