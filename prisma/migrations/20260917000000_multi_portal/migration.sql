-- 多门户改造：新增 Portal / PortalMember，Staff.isSystemAdmin，业务表归属 portalId，
-- 全部旧数据回填到默认门户 "default"，旧员工按原权限成为 default 成员，
-- 最后移除 Staff.isAdmin / pagePermissions 并清空旧会话（所有用户重新登录一次）。
-- 系统主管理员不在 SQL 中猜测：由部署负责人在迁移前通过 REPAIRNOTE_SYSTEM_ADMIN_STAFF_ID 显式指定，
-- 并由 scripts/portal-admin.mjs bootstrap-system-admin 写入（见 docs/多门户升级与运维说明.md）。

-- 1. 新表
CREATE TABLE `Portal` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `revision` BIGINT NOT NULL DEFAULT 0,
    `creationKey` VARCHAR(64) NULL,
    `creationPayloadHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Portal_creationKey_key`(`creationKey`),
    INDEX `Portal_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PortalMember` (
    `staffId` VARCHAR(191) NOT NULL,
    `portalId` VARCHAR(191) NOT NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `pagePermissions` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PortalMember_portalId_idx`(`portalId`),
    PRIMARY KEY (`staffId`, `portalId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 全局系统管理角色（默认 false，不自动提升任何旧管理员）
ALTER TABLE `Staff` ADD COLUMN `isSystemAdmin` BOOLEAN NOT NULL DEFAULT false;

-- 3. 已有数据时创建稳定的默认门户 "default"
INSERT INTO `Portal` (`id`, `name`, `isActive`, `revision`, `createdAt`, `updatedAt`)
SELECT 'default', '默认门户', true, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `Staff`)
   OR EXISTS (SELECT 1 FROM `Setting`)
   OR EXISTS (SELECT 1 FROM `Client`)
   OR EXISTS (SELECT 1 FROM `Repair`)
   OR EXISTS (SELECT 1 FROM `Brand`)
   OR EXISTS (SELECT 1 FROM `BackupSnapshot`);

-- 4. 旧员工按原 isAdmin / pagePermissions 成为默认门户成员（旧管理员只成为 default 的门户管理员）
INSERT INTO `PortalMember` (`staffId`, `portalId`, `isAdmin`, `pagePermissions`, `createdAt`, `updatedAt`)
SELECT s.`id`, 'default', s.`isAdmin`, s.`pagePermissions`, s.`createdAt`, CURRENT_TIMESTAMP(3)
FROM `Staff` s
WHERE EXISTS (SELECT 1 FROM `Portal` p WHERE p.`id` = 'default');

-- 5. 业务表归属：先允许为空，回填 default，再改为非空
ALTER TABLE `Client` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Brand` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Model` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Service` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Part` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Technician` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `AttributeGroup` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Attribute` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `Repair` ADD COLUMN `portalId` VARCHAR(191) NULL;
ALTER TABLE `BackupSnapshot` ADD COLUMN `portalId` VARCHAR(191) NULL, ADD COLUMN `autoDay` VARCHAR(10) NULL;

UPDATE `Client` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Brand` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Model` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Service` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Part` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Technician` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `AttributeGroup` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Attribute` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `Repair` SET `portalId` = 'default' WHERE `portalId` IS NULL;
UPDATE `BackupSnapshot` SET `portalId` = 'default' WHERE `portalId` IS NULL;

ALTER TABLE `Client` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Brand` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Model` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Service` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Part` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Technician` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `AttributeGroup` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Attribute` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `Repair` MODIFY `portalId` VARCHAR(191) NOT NULL;
ALTER TABLE `BackupSnapshot` MODIFY `portalId` VARCHAR(191) NOT NULL;

-- 6. 设置改为每门户一行，以 portalId 为主键；原 id="main" 迁到 default
ALTER TABLE `Setting` ADD COLUMN `portalId` VARCHAR(191) NULL;
UPDATE `Setting` SET `portalId` = 'default' WHERE `id` = 'main';
DELETE FROM `Setting` WHERE `portalId` IS NULL;
ALTER TABLE `Setting` DROP PRIMARY KEY, DROP COLUMN `id`, MODIFY `portalId` VARCHAR(191) NOT NULL, ADD PRIMARY KEY (`portalId`);

-- 7. 旧外键 / 旧全局唯一键与索引
ALTER TABLE `Model` DROP FOREIGN KEY `Model_brandId_fkey`;
ALTER TABLE `Attribute` DROP FOREIGN KEY `Attribute_groupId_fkey`;
ALTER TABLE `Repair` DROP FOREIGN KEY `Repair_clientId_fkey`;

DROP INDEX `Client_name_idx` ON `Client`;
DROP INDEX `Client_phone_idx` ON `Client`;
DROP INDEX `Brand_name_key` ON `Brand`;
DROP INDEX `Model_brandId_idx` ON `Model`;
DROP INDEX `Technician_name_key` ON `Technician`;
DROP INDEX `AttributeGroup_name_key` ON `AttributeGroup`;
DROP INDEX `Attribute_groupId_idx` ON `Attribute`;
DROP INDEX `Repair_ticket_key` ON `Repair`;
DROP INDEX `Repair_clientId_idx` ON `Repair`;
DROP INDEX `Repair_orderType_idx` ON `Repair`;
DROP INDEX `Repair_sourceRepairId_idx` ON `Repair`;
DROP INDEX `Repair_status_idx` ON `Repair`;
DROP INDEX `Repair_repairTime_idx` ON `Repair`;
DROP INDEX `Repair_createdAt_idx` ON `Repair`;
DROP INDEX `Repair_ticketSort_idx` ON `Repair`;
DROP INDEX `Repair_technicianId_idx` ON `Repair`;
DROP INDEX `Repair_technicianName_idx` ON `Repair`;
DROP INDEX `BackupSnapshot_createdAt_idx` ON `BackupSnapshot`;
DROP INDEX `BackupSnapshot_kind_idx` ON `BackupSnapshot`;

-- 8. 门户范围的唯一键与索引（publicToken 继续全局唯一，未改动）
CREATE INDEX `Client_portalId_name_idx` ON `Client`(`portalId`, `name`);
CREATE INDEX `Client_portalId_phone_idx` ON `Client`(`portalId`, `phone`);
CREATE INDEX `Client_portalId_createdAt_idx` ON `Client`(`portalId`, `createdAt`);
CREATE UNIQUE INDEX `Client_portalId_id_key` ON `Client`(`portalId`, `id`);
CREATE UNIQUE INDEX `Brand_portalId_id_key` ON `Brand`(`portalId`, `id`);
CREATE UNIQUE INDEX `Brand_portalId_name_key` ON `Brand`(`portalId`, `name`);
CREATE INDEX `Model_portalId_brandId_idx` ON `Model`(`portalId`, `brandId`);
CREATE INDEX `Service_portalId_sortOrder_idx` ON `Service`(`portalId`, `sortOrder`);
CREATE INDEX `Part_portalId_sortOrder_idx` ON `Part`(`portalId`, `sortOrder`);
CREATE INDEX `Technician_portalId_sortOrder_idx` ON `Technician`(`portalId`, `sortOrder`);
CREATE UNIQUE INDEX `Technician_portalId_name_key` ON `Technician`(`portalId`, `name`);
CREATE UNIQUE INDEX `AttributeGroup_portalId_id_key` ON `AttributeGroup`(`portalId`, `id`);
CREATE UNIQUE INDEX `AttributeGroup_portalId_name_key` ON `AttributeGroup`(`portalId`, `name`);
CREATE INDEX `Attribute_portalId_groupId_idx` ON `Attribute`(`portalId`, `groupId`);
CREATE INDEX `Repair_portalId_clientId_idx` ON `Repair`(`portalId`, `clientId`);
CREATE INDEX `Repair_portalId_orderType_idx` ON `Repair`(`portalId`, `orderType`);
CREATE INDEX `Repair_portalId_sourceRepairId_idx` ON `Repair`(`portalId`, `sourceRepairId`);
CREATE INDEX `Repair_portalId_status_idx` ON `Repair`(`portalId`, `status`);
CREATE INDEX `Repair_portalId_repairTime_idx` ON `Repair`(`portalId`, `repairTime`);
CREATE INDEX `Repair_portalId_createdAt_idx` ON `Repair`(`portalId`, `createdAt`);
CREATE INDEX `Repair_portalId_ticketSort_idx` ON `Repair`(`portalId`, `ticketSort`);
CREATE INDEX `Repair_portalId_technicianId_idx` ON `Repair`(`portalId`, `technicianId`);
CREATE INDEX `Repair_portalId_technicianName_idx` ON `Repair`(`portalId`, `technicianName`);
CREATE UNIQUE INDEX `Repair_portalId_ticket_key` ON `Repair`(`portalId`, `ticket`);
CREATE INDEX `BackupSnapshot_portalId_createdAt_idx` ON `BackupSnapshot`(`portalId`, `createdAt`);
CREATE INDEX `BackupSnapshot_portalId_kind_idx` ON `BackupSnapshot`(`portalId`, `kind`);
CREATE UNIQUE INDEX `BackupSnapshot_portalId_kind_autoDay_key` ON `BackupSnapshot`(`portalId`, `kind`, `autoDay`);

-- 9. 外键：同门户复合外键，禁止跨门户引用
ALTER TABLE `PortalMember` ADD CONSTRAINT `PortalMember_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PortalMember` ADD CONSTRAINT `PortalMember_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Client` ADD CONSTRAINT `Client_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Brand` ADD CONSTRAINT `Brand_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Model` ADD CONSTRAINT `Model_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Model` ADD CONSTRAINT `Model_portalId_brandId_fkey` FOREIGN KEY (`portalId`, `brandId`) REFERENCES `Brand`(`portalId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Service` ADD CONSTRAINT `Service_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Part` ADD CONSTRAINT `Part_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Technician` ADD CONSTRAINT `Technician_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AttributeGroup` ADD CONSTRAINT `AttributeGroup_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Attribute` ADD CONSTRAINT `Attribute_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Attribute` ADD CONSTRAINT `Attribute_portalId_groupId_fkey` FOREIGN KEY (`portalId`, `groupId`) REFERENCES `AttributeGroup`(`portalId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_portalId_clientId_fkey` FOREIGN KEY (`portalId`, `clientId`) REFERENCES `Client`(`portalId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Setting` ADD CONSTRAINT `Setting_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `BackupSnapshot` ADD CONSTRAINT `BackupSnapshot_portalId_fkey` FOREIGN KEY (`portalId`) REFERENCES `Portal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. 旧全局业务角色列已回填到 PortalMember，从 Staff 移除；清空旧会话，所有用户重新登录一次
ALTER TABLE `Staff` DROP COLUMN `isAdmin`, DROP COLUMN `pagePermissions`;
DELETE FROM `StaffSession`;
UPDATE `Staff` SET `sessionTokenHash` = NULL, `sessionExpiresAt` = NULL;
