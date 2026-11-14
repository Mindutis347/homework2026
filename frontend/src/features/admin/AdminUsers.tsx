import { useEffect, useState } from 'react'

import { adminApi } from '@/api/endpoints'
import type { AdminUser, User } from '@/api/types'
import { TableShell } from '@/components/TableShell'
import { Badge, Card, EmptyState, ErrorNote, Input, SectionHeading, Select, Skeleton } from '@/components/ui'
import { useAuth } from '@/features/auth/AuthContext'
import { formatDate, formatEuro } from '@/lib/format'

const ROLES: User['role'][] = ['customer', 'merchant', 'admin']

const ROLE_TONE: Record<User['role'], 'brand' | 'accent' | 'neutral'> = {
  customer: 'neutral',
  merchant: 'accent',
  admin: 'brand',
}

/** User directory. The role select is the only mutation here: promoting a
 *  customer to merchant is how the merchant portal is unlocked. */
export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const [term, setTerm] = useState('')
  const [appliedTerm, setAppliedTerm] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedTerm(term), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminApi
      .users(appliedTerm)
      .then(({ users: fetched }) => {
        if (cancelled) return
        setUsers(fetched)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load users')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appliedTerm, reloadToken])

  async function changeRole(userId: number, role: string) {
    setBusyId(userId)
    setError(null)
    try {
      await adminApi.setRole(userId, role)
      setReloadToken((token) => token + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not change that role')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <SectionHeading
        title="Users"
        subtitle="Search accounts, check verification and manage roles."
        action={
          <div className="w-full sm:w-64">
            <Input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search name or email"
              aria-label="Search users"
            />
          </div>
        }
      />

      {error && <div className="mb-4"><ErrorNote message={error} /></div>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          title="No users match that search"
          description="Try a different name, email fragment or clear the search field."
        />
      ) : (
        <Card>
          <TableShell>
          <table className="w-full min-w-[520px] text-sm sm:min-w-[900px]">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Verified</th>
                <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">Orders</th>
                <th scope="col" className="hidden px-4 py-3 text-right sm:table-cell">Spent</th>
                <th scope="col" className="hidden px-4 py-3 sm:table-cell">Joined</th>
                <th scope="col" className="px-4 py-3">Role control</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => {
                const isSelf = currentUser?.id === row.id
                return (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">{row.displayName}</p>
                      {row.storeName && <p className="text-xs text-ink-500">{row.storeName}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{row.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={ROLE_TONE[row.role]}>{row.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.isVerified ? 'success' : 'neutral'}>
                        {row.isVerified ? 'verified' : 'unverified'}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-right text-ink-700 sm:table-cell">{row.orders}</td>
                    <td className="hidden px-4 py-3 text-right text-ink-700 sm:table-cell">{formatEuro(row.spentCents)}</td>
                    <td className="hidden px-4 py-3 text-ink-500 sm:table-cell">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={row.role}
                        aria-label={`Role for ${row.displayName}`}
                        disabled={isSelf || busyId === row.id}
                        title={
                          isSelf
                            ? 'You cannot change your own role. Ask another admin to adjust it.'
                            : 'Changing the role applies immediately.'
                        }
                        className="min-w-[130px]"
                        onChange={(event) => void changeRole(row.id, event.target.value)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </TableShell>
        </Card>
      )}
    </div>
  )
}

export { AdminUsers }
