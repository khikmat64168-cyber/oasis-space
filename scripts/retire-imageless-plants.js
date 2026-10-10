/*
 * Retire the plants whose only plantImages entry points at a file that is not
 * on disk. All of them are development test records and none has a usable
 * photo, so they would otherwise sit in the catalogue and the /plants ring
 * showing placeholder art.
 *
 * This mirrors PlantService.updatePlantByAdmin exactly:
 *   plantStatus -> DELETE, deletedAt -> now, and the owner's memberPlants
 *   counter decremented by one.
 * It is a soft delete: nothing is erased, and flipping plantStatus back to
 * ACTIVE (and re-incrementing the counter) restores the listing.
 *
 * Run with --apply to write; without it, it only reports.
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/** plantImages paths are stored relative to the API's working directory */
const API_ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

(async () => {
	const uri = process.env.MONGO_DEV;
	if (!uri) throw new Error('MONGO_DEV is not set');
	await mongoose.connect(uri);
	const db = mongoose.connection.db;

	const plants = await db.collection('plants').find({ plantStatus: 'ACTIVE' }).toArray();

	// a plant is retired only when it has NO image that resolves on disk
	const doomed = plants.filter((p) => {
		const imgs = p.plantImages || [];
		return !imgs.some((img) => fs.existsSync(path.join(API_ROOT, img)));
	});

	console.log(`active plants: ${plants.length}`);
	console.log(`without a single usable photo: ${doomed.length}`);
	doomed.forEach((p) => console.log(`  - ${p.plantName}  [${(p.plantImages || []).join(', ') || 'no images'}]`));

	if (!APPLY) {
		console.log('\nDRY RUN — nothing written. Re-run with --apply.');
		await mongoose.disconnect();
		return;
	}

	const now = new Date();
	for (const p of doomed) {
		const res = await db.collection('plants').updateOne(
			{ _id: p._id, plantStatus: 'ACTIVE' },
			{ $set: { plantStatus: 'DELETE', deletedAt: now } },
		);
		// guard the counter on the update actually having happened, so a second
		// run cannot decrement memberPlants twice
		if (res.modifiedCount === 1) {
			await db.collection('members').updateOne({ _id: p.memberId }, { $inc: { memberPlants: -1 } });
			console.log(`retired: ${p.plantName}`);
		}
	}

	const left = await db.collection('plants').countDocuments({ plantStatus: 'ACTIVE' });
	console.log(`\nactive plants now: ${left}`);
	await mongoose.disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
