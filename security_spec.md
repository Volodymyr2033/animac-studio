# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Identity & Ownership**: Every document under `/users/{userId}`, `/users/{userId}/watchHistory/{historyId}`, and `/users/{userId}/downloadQueue/{taskId}` must strictly belong to the authenticated and verified user (`request.auth.uid == userId` and `incoming().ownerId == request.auth.uid` and `request.auth.token.email_verified == true`).
2. **Master Gate Relational Sync**: Subcollections `watchHistory` and `downloadQueue` require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`) and verify ownership (`get(/databases/$(database)/documents/users/$(userId)).data.ownerId == request.auth.uid`).
3. **Strict Schema & Volumetric Bounds**: All string fields are bounded by explicit `.size()` checks matching `firebase-blueprint.json`. Unknown/shadow fields are rejected via `hasAll` and `hasOnly`.
4. **Temporal & Immutable Integrity**: `ownerId` and `animeId` cannot be mutated on update (`incoming().ownerId == existing().ownerId`). `updatedAt` must always equal `request.time`.
5. **Query Enforcer**: `allow list` on `watchHistory` and `downloadQueue` enforces `request.auth.uid == userId && resource.data.ownerId == request.auth.uid` without any `get()`/`exists()` inside `list`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null`, creating `/users/user_1` -> `PERMISSION_DENIED`
2. **Unverified Email Write**: `auth = { uid: 'user_1', token: { email_verified: false } }`, creating `/users/user_1` -> `PERMISSION_DENIED`
3. **Cross-User Profile Spoof**: `auth.uid = 'attacker'`, writing to `/users/victim` -> `PERMISSION_DENIED`
4. **Shadow Field Injection**: Adding `"isAdmin": true` to `/users/user_1` -> `PERMISSION_DENIED`
5. **Oversized String Denial-of-Wallet**: `displayName` of 5000 chars on `/users/user_1` -> `PERMISSION_DENIED`
6. **Invalid Enum Value**: `preferredPlatform: "linux-custom"` on `/users/user_1` -> `PERMISSION_DENIED`
7. **Forged Client Timestamp**: `updatedAt` set to a past/future timestamp instead of `request.time` -> `PERMISSION_DENIED`
8. **Orphaned Subcollection Write**: Creating `/users/user_1/watchHistory/h1` when `/users/user_1` does not exist -> `PERMISSION_DENIED`
9. **OwnerId Mutation on Update**: Updating `ownerId` on `/users/user_1/watchHistory/h1` to another user -> `PERMISSION_DENIED`
10. **ID Poisoning**: Document ID containing special characters or > 128 chars -> `PERMISSION_DENIED`
11. **Out-of-Bounds Progress**: `progressPercent: 250` on `/users/user_1/downloadQueue/t1` -> `PERMISSION_DENIED`
12. **Unauthorized Cross-User List**: Listing `/users/victim/watchHistory` as `attacker` -> `PERMISSION_DENIED`
