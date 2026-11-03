import { useState } from 'react'
import { ORGANIZATION_ROLES, type OrganizationPerson, type OrganizationRole, useOrganization } from './organization-state'
import { Avatar, AvatarFallback } from './studio-ui/avatar'
import { Badge } from './studio-ui/badge'
import { Button } from './studio-ui/button'
import { Input } from './studio-ui/input'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './studio-ui/table'
import { Textarea } from './studio-ui/textarea'
import './organization.css'

function PersonAvatar({ person }: { person: OrganizationPerson }) {
  return <Avatar aria-hidden="true"><AvatarFallback>{person.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</AvatarFallback></Avatar>
}
function OrganizationLinks() {
  return <nav className="org-links" aria-label="People and access pages"><a href="#profile">My profile</a><a href="#people">People</a><a href="#teams">Teams</a><a href="#vendors">Vendors</a><a href="#roles">Roles & access</a><a href="#admin">Administration</a></nav>
}
function DemoNote({ admin = false }: { admin?: boolean }) {
  return <p className="org-note">Fictional people and local changes only. Nothing is sent or saved after reload.{admin && ' Choose Administrator in Preview options to try management controls.'}</p>
}
export function ProfilePage({ personId = 'alex', previewRole }: { personId?: string; previewRole: string }) {
  const { people, teams, updateProfile } = useOrganization()
  const person = people.find(item => item.id === personId)
  if (!person) return <div className="org-page"><OrganizationLinks /><h2>Profile unavailable</h2><p>This sample person is no longer in the directory.</p><a href="#people">Return to People</a></div>
  return <ProfileDetails key={person.id} person={person} teams={teams} updateProfile={updateProfile} previewRole={previewRole} />
}
function ProfileDetails({ person, teams, updateProfile, previewRole }: {
  person: OrganizationPerson
  teams: ReturnType<typeof useOrganization>['teams']
  updateProfile: ReturnType<typeof useOrganization>['updateProfile']
  previewRole: string
}) {
  const [message, setMessage] = useState('')
  const canEdit = person.id === 'alex' || previewRole === 'Admin'
  return <div className="org-page"><OrganizationLinks />
    <section className="org-profile-heading"><PersonAvatar person={person} /><div><p className="org-eyebrow">{person.id === 'alex' ? 'My sample profile' : 'Sample colleague'}</p><h2>{person.name}</h2><p>{person.title}</p></div><Badge variant="outline">{person.status}</Badge></section>
    <DemoNote />
    <a href={`#graph?focus=${encodeURIComponent(`person:${person.id}`)}`}>See connections →</a>
    <div className="org-profile-layout"><section className="org-section"><h3>About {person.id === 'alex' ? 'you' : person.name.split(' ')[0]}</h3>
      <dl className="org-facts"><div><dt>Sample email</dt><dd>{person.email}</dd></div><div><dt>Teams</dt><dd>{teams.filter(team => person.teamIds.includes(team.id)).map(team => team.name).join(', ') || 'No teams'}</dd></div><div><dt>Sample role</dt><dd>{person.role}</dd></div></dl>
      <p className="org-note">Names stay fixed so task ownership stays understandable. Team membership and roles are managed in People.</p>
    </section><section className="org-section"><h3>Profile & preferences</h3>
      {!canEdit && <p className="org-note">You can view this colleague’s profile. Switch to the sample Administrator role to edit it.</p>}
      <form className="org-form" onSubmit={event => { event.preventDefault(); if (!canEdit) return; const data = new FormData(event.currentTarget); updateProfile(person.id, { title: String(data.get('title')).trim(), bio: String(data.get('bio')).trim(), notifications: data.get('notifications') === 'on' }); setMessage('Sample profile saved for this preview session.') }}>
        <label>Job title<Input name="title" defaultValue={person.title} maxLength={80} required disabled={!canEdit} /></label>
        <label>A little about you<Textarea name="bio" defaultValue={person.bio} maxLength={500} rows={4} disabled={!canEdit} /></label>
        <label className="org-check"><input name="notifications" type="checkbox" defaultChecked={person.notifications} disabled={!canEdit} />Show a sample preference for work updates</label>
        <p className="org-note">This preference demonstrates the design. It does not send notifications.</p><Button type="submit" disabled={!canEdit}>Save sample profile</Button>
      </form><p role="status">{message}</p>
    </section></div>
  </div>
}
export function PeoplePage({ previewRole }: { previewRole: string }) {
  const { people, teams, invitePerson, setPersonStatus, setPersonRole } = useOrganization()
  const [query, setQuery] = useState('')
  const [teamId, setTeamId] = useState('all')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [message, setMessage] = useState('')
  const admin = previewRole === 'Admin'
  const matches = people.filter(person => `${person.name} ${person.email} ${person.title}`.toLowerCase().includes(query.toLowerCase()) && (teamId === 'all' || person.teamIds.includes(teamId)) && (role === 'all' || person.role === role) && (status === 'all' || person.status === status))
  return <div className="org-page"><OrganizationLinks /><h2>People, with a place for everyone</h2><p>Find a colleague, see their teams, and explore how access could be managed.</p><DemoNote admin={!admin} />
    <div className="org-filters"><label>Find a person<Input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email or job title" /></label><label>Team<select value={teamId} onChange={event => setTeamId(event.target.value)}><option value="all">All teams</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Role<select value={role} onChange={event => setRole(event.target.value)}><option value="all">All roles</option>{ORGANIZATION_ROLES.map(value => <option key={value}>{value}</option>)}</select></label><label>Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option>Active</option><option>Invited</option><option>Paused</option></select></label></div>
    <Table><TableCaption>{matches.length} of {people.length} sample people. Changes are a design demonstration.</TableCaption><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Teams</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Manage</TableHead></TableRow></TableHeader><TableBody>{matches.map(person => <TableRow key={person.id}><TableCell><a className="org-person" href={`#profile?person=${encodeURIComponent(person.id)}`}><PersonAvatar person={person} /><span><strong>{person.name}</strong><small>{person.email}</small></span></a></TableCell><TableCell>{teams.filter(team => person.teamIds.includes(team.id)).map(team => team.name).join(', ') || 'No teams'}</TableCell><TableCell><select aria-label={`Role for ${person.name}`} value={person.role} disabled={!admin} onChange={event => { if (admin) { setPersonRole(person.id, event.target.value as OrganizationRole); setMessage(`${person.name}’s sample role changed. No real access was changed.`) } }}>{ORGANIZATION_ROLES.map(value => <option key={value}>{value}</option>)}</select></TableCell><TableCell><Badge variant="outline">{person.status}</Badge></TableCell><TableCell><Button variant="outline" disabled={!admin} onClick={() => { if (admin) { setPersonStatus(person.id, person.status === 'Active' ? 'Paused' : 'Active'); setMessage(`${person.name}’s sample status changed. Existing task ownership is preserved.`) } }}>{person.status === 'Invited' ? 'Activate sample' : person.status === 'Paused' ? 'Reactivate sample' : 'Pause sample'}</Button></TableCell></TableRow>)}</TableBody></Table>
    {matches.length === 0 && <p>No sample people match. Try another name or clear a filter.</p>}
    <p role="status">{message}</p>
    <details className="org-section"><summary>Add a sample invitation</summary><p>No invitation email is sent. Use made-up details.</p><form className="org-form" onSubmit={event => { event.preventDefault(); if (!admin) return; const form = event.currentTarget; const data = new FormData(form); const error = invitePerson(String(data.get('name')), String(data.get('email')), String(data.get('team')), String(data.get('role')) as OrganizationRole); setMessage(error || 'Sample invitation added. No email was sent.'); if (!error) form.reset() }}><div className="org-form-row"><label>Sample name<Input name="name" maxLength={70} required disabled={!admin} /></label><label>Sample email<Input name="email" type="email" placeholder="colleague@example.test" maxLength={120} required disabled={!admin} /></label></div><div className="org-form-row"><label>Team<select name="team" disabled={!admin}>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Role<select name="role" disabled={!admin}>{ORGANIZATION_ROLES.map(value => <option key={value}>{value}</option>)}</select></label></div><Button type="submit" disabled={!admin}>Add sample invitation</Button></form></details>
  </div>
}
export function TeamsPage({ previewRole }: { previewRole: string }) {
  const { people, teams, setMembership, addTeam } = useOrganization()
  const [selectedId, setSelectedId] = useState('company')
  const [message, setMessage] = useState('')
  const selected = teams.find(team => team.id === selectedId) || teams[0]
  const admin = previewRole === 'Admin'
  return <div className="org-page"><OrganizationLinks /><h2>A shared home for each team</h2><p>Organize colleagues around their work. Membership is separate from permission to every document.</p><DemoNote admin={!admin} />
    <div className="org-team-layout"><nav className="org-team-list" aria-label="Choose a sample team">{teams.map(team => <button key={team.id} type="button" aria-pressed={selected.id === team.id} onClick={() => { setSelectedId(team.id); setMessage('') }}><strong>{team.name}</strong><span>{people.filter(person => person.teamIds.includes(team.id)).length} sample members</span></button>)}</nav><section className="org-section"><h3>{selected.name}</h3><p>{selected.description}</p><p className="org-note">Select members for this sample team. Real access would also require workspace and document rules.</p><fieldset disabled={!admin} className="org-member-list"><legend>Sample membership</legend>{people.map(person => <label key={person.id} className="org-check"><input type="checkbox" checked={person.teamIds.includes(selected.id)} onChange={event => { if (admin) { setMembership(person.id, selected.id, event.target.checked); setMessage(`Sample membership updated for ${person.name}.`) } }} /><span>{person.name}<small>{person.status} · {person.role}</small></span></label>)}</fieldset><p role="status">{message}</p></section></div>
    <details className="org-section"><summary>Create a sample team</summary><form className="org-form" onSubmit={event => { event.preventDefault(); if (!admin) return; const form = event.currentTarget; const data = new FormData(form); const error = addTeam(String(data.get('name')), String(data.get('description'))); setMessage(error || 'Sample team created. Add members above.'); if (!error) form.reset() }}><label>Team name<Input name="name" maxLength={60} required disabled={!admin} /></label><label>What will this team work on?<Textarea name="description" maxLength={240} rows={2} disabled={!admin} /></label><Button type="submit" disabled={!admin}>Create sample team</Button></form></details>
  </div>
}
const roleExamples = [
  { name: 'Reader', read: 'Yes, where shared', edit: 'No', review: 'No', manage: 'No', example: 'Find and read team knowledge.' },
  { name: 'Editor', read: 'Yes, where shared', edit: 'Within assigned areas', review: 'No', manage: 'No', example: 'Draft knowledge and work items.' },
  { name: 'Reviewer', read: 'Yes, where shared', edit: 'Within assigned areas', review: 'Assigned team only; never own work', manage: 'No', example: 'Review a colleague’s proposed change.' },
  { name: 'Administrator', read: 'Separate content permission', edit: 'Separate content permission', review: 'Assigned work in an explicit member team', manage: 'People, teams and app settings', example: 'Manage the workspace without automatic access to private HR content.' },
]
export function RolesPage({ previewRole }: { previewRole: string }) {
  const { people } = useOrganization()
  return <div className="org-page"><OrganizationLinks /><h2>The right access for the work</h2><p>Give people a role in the areas they need. Keep confidential information limited to its intended audience.</p><DemoNote />
    <p className="org-note">This proposed matrix explains the design. The HTML preview does not enforce a server policy. Preview options currently shows {previewRole === 'Admin' ? 'Administrator' : previewRole === 'Curator' ? 'Editor' : 'Reader'}; it does not sign in as a person.</p>
    <Table><TableCaption>Proposed role examples. Every content action also needs the appropriate team, workspace and file permission.</TableCaption><TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Read</TableHead><TableHead>Edit</TableHead><TableHead>Review</TableHead><TableHead>Manage</TableHead></TableRow></TableHeader><TableBody>{roleExamples.map(role => <TableRow key={role.name}><TableCell><strong>{role.name}</strong></TableCell><TableCell>{role.read}</TableCell><TableCell>{role.edit}</TableCell><TableCell>{role.review}</TableCell><TableCell>{role.manage}</TableCell></TableRow>)}</TableBody></Table>
    <section className="org-section"><h3>What this means day to day</h3><ul className="org-examples">{roleExamples.map(role => <li key={role.name}><strong>{role.name}</strong><span>{role.example}</span><small>{people.filter(person => person.role === role.name).length} sample people with this role</small></li>)}</ul><p>An IT administrator would need an explicit content grant to read an HR file. Owning a task would not by itself grant access to its attachments.</p><a href="#people">Explore sample role assignments in People →</a></section>
  </div>
}

export function VendorsPage({ vendorId, contactId }: { vendorId?: string; contactId?: string }) {
  const { vendors, contacts, people } = useOrganization()
  const contact = contacts.find(item => item.id === contactId)
  const vendor = vendors.find(item => item.id === (contact?.vendorId || vendorId)) || (!vendorId && !contactId ? vendors[0] : undefined)
  return <div className="org-page"><OrganizationLinks /><h2>Companies and the people to contact</h2><p className="org-note">Fictional company and contact details. Example addresses do not contact a real business. This preview does not send messages.</p><div className="org-profile-layout"><section className="org-section"><h3>Sample vendors</h3>{vendors.map(item => <p key={item.id}><a href={`#vendors?vendor=${item.id}`}>{item.name}</a></p>)}</section><section className="org-section" aria-label="Vendor and contact details">{vendor ? <><h3>{vendor.name}</h3><p>{vendor.description}</p><dl className="org-facts"><div><dt>Company email</dt><dd>{vendor.email || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{vendor.phone || 'Not provided'}</dd></div><div><dt>Website example</dt><dd>{vendor.website || 'Not provided'}</dd></div><div><dt>Relationship owner</dt><dd><a href={`#profile?person=${vendor.ownerId}`}>{people.find(person => person.id === vendor.ownerId)?.name || 'Not provided'}</a></dd></div></dl><a href={`#graph?focus=${encodeURIComponent(`vendor:${vendor.id}`)}`}>See company connections →</a><h3>Contacts</h3>{contacts.filter(item => item.vendorId === vendor.id).map(item => <section key={item.id}><h4>{item.name}{contact?.id === item.id ? ' · selected' : ''}</h4><dl className="org-facts"><div><dt>Job title</dt><dd>{item.title}</dd></div><div><dt>Email</dt><dd>{item.email || 'Not provided'}</dd></div><div><dt>Phone</dt><dd>{item.phone || 'Not provided'}</dd></div></dl><a href={`#graph?focus=${encodeURIComponent(`contact:${item.id}`)}`}>See contact connections →</a></section>)}</> : <><h3>Sample record not found</h3><a href="#vendors">Show current vendors</a></>}</section></div></div>
}
