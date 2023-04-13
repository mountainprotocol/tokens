# USDM

This smart contract implements a rebasing ERC-20 token with additional functionality such as rebasing, reward multiplier, blacklisting, permit support and upgradeability.

## Features

- Rebasing token mechanism
- Minting and burning functionality
- Blacklisting addresses
- Reward multiplier system
- EIP-2612 permit support
- OpenZeppelin UUPS upgrade pattern

## Dev

### Contributing

This project uses Hardhat. It includes a contract, its tests, and a script that deploys the contract.

> Prerequisites: Node v18 LTS

### Installation

Install hardhat

```shell
npm install -g hardhat
```

### Usage

Try running some of the following tasks:

Testing
```shell
REPORT_GAS=true npx hh test
```

Coverage
```shell
npx hh coverage
```

Running local node
```shell
npx hh node
```

Compile
```shell
npx hh compile
```

Deploying and contract verification
```shell
npx hh run scripts/deploy.ts--network goerli
npx hh verify --network goerli <contact-address>
```

Help
```shell
npx hh help
```

### Functions

#### Public and External Functions

- `initialize(string memory name_, string memory symbol_, uint256 initialShares)`: Initializes the contract.
- `mint(address to, uint256 amount)`: Mints new tokens to the specified address.
- `burn(address from, uint256 amount)`: Burns tokens from the specified address.
- `transfer(address to, uint256 amount)`: Transfers tokens between addresses.
- `pause()`: Pauses the contract, halting token transfers.
- `unpause()`: Unpauses the contract, allowing token transfers.
- `addRewardMultiplier(uint256 rewardMultiplier_)`: Adds a reward multiplier to the contract.
- `approve(address spender, uint256 amount)`: Approves an allowance for a spender.
- `allowance(address owner, address spender)`: Returns the allowance for a spender.
- `DOMAIN_SEPARATOR()`: Returns the EIP-712 domain separator.
- `nonces(address owner)`: Returns the nonce for the specified address.
- `permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)`: Implements EIP-2612 permit functionality.

#### Internal and Private Functions

- `_mint(address to, uint256 shares)`: Internal function to mint tokens to the specified address.
- `_burn(address account, uint256 shares)`: Internal function to burn tokens from the specified address.
- `_transferShares(address from, address to, uint256 shares)`: Internal function to transfer tokens between addresses.
- `_authorizeUpgrade(address newImplementation)`: Internal function to authorize an upgrade.

#### Events

- `AddressBlacklisted(address indexed addr)`: Emitted when an address is blacklisted.
- `AddressUnBlacklisted(address indexed addr)`: Emitted when an address is removed from the blacklist.
- `RewardMultiplier(uint256 indexed addr)`: Emitted when the reward multiplier is updated.
- `Transfer(from indexed addr, to uint256, amount uint256)`: Emitted transfering tokens.


#### Roles

- MINTER_ROLE: Grants the ability to mint tokens.
- BURNER_ROLE: Grants the ability to burn tokens.
- BLACKLIST_ROLE: Grants the ability to manage the blacklist.
- ORACLE_ROLE: Grants the ability to update the reward multiplier.
- UPGRADER_ROLE: Grants the ability to upgrade the contract.
