package httpx

// Role values mirror the users.role check constraint.
const (
	RoleCustomer = "customer"
	RoleMerchant = "merchant"
	RoleAdmin    = "admin"
)

// Principal is the authenticated user as far as handlers care: who they are,
// what they may do, and whether they finished e-mail verification.
type Principal struct {
	UserID      int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
	IsVerified  bool   `json:"isVerified"`
}

func (p *Principal) IsAdmin() bool { return p != nil && p.Role == RoleAdmin }
func (p *Principal) IsMerchant() bool {
	return p != nil && (p.Role == RoleMerchant || p.Role == RoleAdmin)
}
