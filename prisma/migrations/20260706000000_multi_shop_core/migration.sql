CREATE TABLE `Shop` (
  `id` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Shop_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Shop` (`id`, `slug`, `name`, `active`, `createdAt`, `updatedAt`)
VALUES ('default-shop', 'default', '默认门店', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

ALTER TABLE `Staff` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `StaffSession` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Client` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Brand` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Model` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Service` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Part` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Technician` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `AttributeGroup` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Attribute` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Repair` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `RepairItem` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Payment` ADD COLUMN `shopId` VARCHAR(191) NULL;
ALTER TABLE `Setting` ADD COLUMN `shopId` VARCHAR(191) NULL, ADD COLUMN `key` VARCHAR(191) NULL DEFAULT 'main';
ALTER TABLE `BackupSnapshot` ADD COLUMN `shopId` VARCHAR(191) NULL;

UPDATE `Staff` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `StaffSession` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Client` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Brand` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Model` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Service` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Part` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Technician` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `AttributeGroup` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Attribute` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Repair` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `RepairItem` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Payment` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;
UPDATE `Setting` SET `shopId` = 'default-shop', `key` = 'main' WHERE `shopId` IS NULL OR `key` IS NULL;
UPDATE `BackupSnapshot` SET `shopId` = 'default-shop' WHERE `shopId` IS NULL;

ALTER TABLE `Staff` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `StaffSession` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Client` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Brand` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Model` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Service` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Part` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Technician` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `AttributeGroup` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Attribute` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Repair` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `RepairItem` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Payment` MODIFY `shopId` VARCHAR(191) NOT NULL;
ALTER TABLE `Setting` MODIFY `shopId` VARCHAR(191) NOT NULL, MODIFY `key` VARCHAR(191) NOT NULL DEFAULT 'main';
ALTER TABLE `BackupSnapshot` MODIFY `shopId` VARCHAR(191) NOT NULL;

ALTER TABLE `Staff` DROP INDEX `Staff_username_key`;
ALTER TABLE `Brand` DROP INDEX `Brand_name_key`;
ALTER TABLE `Technician` DROP INDEX `Technician_name_key`;
ALTER TABLE `AttributeGroup` DROP INDEX `AttributeGroup_name_key`;
ALTER TABLE `Repair` DROP INDEX `Repair_ticket_key`;

CREATE UNIQUE INDEX `Staff_shopId_username_key` ON `Staff`(`shopId`, `username`);
CREATE INDEX `Staff_shopId_idx` ON `Staff`(`shopId`);
CREATE INDEX `StaffSession_shopId_idx` ON `StaffSession`(`shopId`);
CREATE INDEX `Client_shopId_idx` ON `Client`(`shopId`);
CREATE UNIQUE INDEX `Brand_shopId_name_key` ON `Brand`(`shopId`, `name`);
CREATE INDEX `Brand_shopId_idx` ON `Brand`(`shopId`);
CREATE INDEX `Model_shopId_idx` ON `Model`(`shopId`);
CREATE INDEX `Service_shopId_idx` ON `Service`(`shopId`);
CREATE INDEX `Part_shopId_idx` ON `Part`(`shopId`);
CREATE UNIQUE INDEX `Technician_shopId_name_key` ON `Technician`(`shopId`, `name`);
CREATE INDEX `Technician_shopId_idx` ON `Technician`(`shopId`);
CREATE UNIQUE INDEX `AttributeGroup_shopId_name_key` ON `AttributeGroup`(`shopId`, `name`);
CREATE INDEX `AttributeGroup_shopId_idx` ON `AttributeGroup`(`shopId`);
CREATE INDEX `Attribute_shopId_idx` ON `Attribute`(`shopId`);
CREATE UNIQUE INDEX `Repair_shopId_ticket_key` ON `Repair`(`shopId`, `ticket`);
CREATE INDEX `Repair_shopId_idx` ON `Repair`(`shopId`);
CREATE INDEX `RepairItem_shopId_idx` ON `RepairItem`(`shopId`);
CREATE INDEX `Payment_shopId_idx` ON `Payment`(`shopId`);
CREATE UNIQUE INDEX `Setting_shopId_key_key` ON `Setting`(`shopId`, `key`);
CREATE INDEX `Setting_shopId_idx` ON `Setting`(`shopId`);
CREATE INDEX `BackupSnapshot_shopId_idx` ON `BackupSnapshot`(`shopId`);

ALTER TABLE `Staff` ADD CONSTRAINT `Staff_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `StaffSession` ADD CONSTRAINT `StaffSession_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Client` ADD CONSTRAINT `Client_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Model` ADD CONSTRAINT `Model_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Service` ADD CONSTRAINT `Service_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Part` ADD CONSTRAINT `Part_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Technician` ADD CONSTRAINT `Technician_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AttributeGroup` ADD CONSTRAINT `AttributeGroup_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Attribute` ADD CONSTRAINT `Attribute_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RepairItem` ADD CONSTRAINT `RepairItem_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Setting` ADD CONSTRAINT `Setting_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BackupSnapshot` ADD CONSTRAINT `BackupSnapshot_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
