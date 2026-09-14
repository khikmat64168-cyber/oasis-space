// CJS stub for the ESM-only `uuid` package, used only under jest so that
// importing libs/config.ts (which pulls in uuid) doesn't choke on ESM syntax.
module.exports = {
	v4: () => '00000000-0000-4000-8000-000000000000',
};
