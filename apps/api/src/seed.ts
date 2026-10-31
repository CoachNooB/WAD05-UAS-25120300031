import { hashPassword, verifyPassword } from './passwords.js';
import { db, transaction } from './database.js';
import { demo } from './config.js';
export async function seed() {
  // Demo credentials match the public login hint, independently of private admin settings.
  const password = demo ? 'sistabrewDemo!2026' : process.env.SEED_ADMIN_PASSWORD;
  if (!password || (!demo && !process.env.SEED_ADMIN_EMAIL))
    throw new Error('Set seed admin credentials.');
  const hash = await hashPassword(password);
  await transaction(async (tx) => {
    const accounts = demo
      ? [
          ['SistaBrew Admin', 'admin@sistabrew.test', 'ADMIN'],
          ['Alya', 'alya@sistabrew.test', 'CUSTOMER'],
          ['Nadia', 'nadia@sistabrew.test', 'CUSTOMER'],
        ]
      : [['SistaBrew Admin', process.env.SEED_ADMIN_EMAIL!.trim().toLowerCase(), 'ADMIN']];
    for (const [name, email, role] of accounts) {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        if (
          demo &&
          (existing.role !== role || !(await verifyPassword(password, existing.passwordHash)))
        )
          throw new Error(
            `Demo account ${email} has different credentials or role. Use a dedicated demo database; existing accounts were not reset.`,
          );
        continue;
      }
      await tx.user.create({ data: { name, email, role, passwordHash: hash } });
    }
    // Re-running seed adds missing accounts without resetting orders, stock or catalog edits.
    if (await tx.category.count()) return;
    const categoryIds: number[] = [];
    for (const [name, description] of [
      ['Syrups', 'A splash of something wonderful.'],
      ['Drink Powders', 'Your café favorites, made at home.'],
      ['Beverage Additives', 'The finishing touches that make it yours.'],
    ]) {
      const category = await tx.category.create({ data: { name, description } });
      categoryIds.push(category.id);
    }
    const products = [
      [
        'SYR-STRAW',
        'Strawberry Bliss',
        1,
        68000,
        24,
        'Sweet, sun-ripened strawberry syrup with a beautifully balanced finish. Made for fruit sodas, lemonades, and a little everyday magic. 750 ml bottle.',
      ],
      [
        'PWD-MATCHA',
        'Everyday Matcha',
        2,
        95000,
        18,
        'Smooth, earthy Japanese-style matcha blend. Whisk into milk for your new daily ritual. 250 g resealable pouch.',
      ],
      [
        'SYR-VAN',
        'Vanilla Cloud',
        1,
        72000,
        32,
        'Soft vanilla bean notes for comforting lattes, milkshakes, and more. 750 ml bottle.',
      ],
      [
        'ADD-BOBA',
        'Brown Sugar Pearls',
        3,
        45000,
        40,
        'Chewy tapioca pearls with rich brown sugar flavor. Cook before serving. 500 g pouch.',
      ],
      [
        'SYR-CAR',
        'Golden Caramel',
        1,
        75000,
        16,
        'Buttery caramel with a touch of toasted sugar. Your iced coffee’s new best friend. 750 ml bottle.',
      ],
      [
        'PWD-CHO',
        'Midnight Chocolate',
        2,
        82000,
        22,
        'Deep cocoa flavor for dreamy hot chocolate and indulgent iced drinks. 500 g pouch.',
      ],
      [
        'PWD-TARO',
        'Dreamy Taro',
        2,
        78000,
        14,
        'Creamy, nutty taro with a lovely lavender hue. Just add your favorite milk. 500 g pouch.',
      ],
      [
        'ADD-JEL',
        'Coconut Jelly',
        3,
        38000,
        25,
        'Tender coconut jelly cubes for refreshers, milk teas, and fruity creations. 500 g jar.',
      ],
      [
        'SYR-LYC',
        'Lovely Lychee',
        1,
        69000,
        0,
        'Delicate floral lychee syrup for refreshing sparkling drinks. 750 ml bottle.',
      ],
      [
        'PWD-COF',
        'Velvet Coffee',
        2,
        88000,
        20,
        'A mellow café latte blend with a smooth, rounded roast. 500 g pouch.',
      ],
      [
        'ADD-CRM',
        'Cloud Creamer',
        3,
        42000,
        30,
        'A silky non-dairy creamer for extra smooth tea and coffee. 500 g pouch.',
      ],
      ['SYR-ROS', 'Rose Petal', 1, 76000, 12, 'Floral rose syrup, coming soon. 750 ml bottle.'],
    ];
    for (const [sku, name, categoryId, price, stock, description] of products)
      await tx.product.create({
        data: {
          sku,
          name,
          categoryId: categoryIds[Number(categoryId) - 1],
          price,
          stock,
          description,
          isActive: sku !== 'SYR-ROS',
        },
      });
  });
}
if (process.argv[1]?.endsWith('seed.ts')) {
  try {
    await seed();
    console.log('Seed complete.');
  } finally {
    await db.$disconnect();
  }
}
