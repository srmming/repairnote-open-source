-- 升级演练用的旧单门户库夹具（配合 prisma/migrations/20260703000000_init 建表后导入）。密码哈希为占位值，不可登录。

INSERT INTO Staff (id,name,username,email,passwordHash,isAdmin,pagePermissions,createdAt,updatedAt) VALUES
('u1','ming','ming','','aabb:cc',1,'["repairs","warranties","clients","settings"]',NOW(3),NOW(3)),
('u2','Old Admin 2','admin2','',  'aabb:dd',1,'["repairs"]',NOW(3),NOW(3)),
('u3','Worker','worker','','aabb:ee',0,'["repairs","warranties"]',NOW(3),NOW(3));
INSERT INTO StaffSession (id,staffId,tokenHash,expiresAt,createdAt,updatedAt) VALUES ('s1','u1','tok',DATE_ADD(NOW(3), INTERVAL 7 DAY),NOW(3),NOW(3));
INSERT INTO Setting (id,value,updatedAt) VALUES ('main','{"shopName":"老店","phone":"600111222","taxRate":21}',NOW(3));
INSERT INTO Client (id,name,docType,identity,email,phone,address,comment,level,createdAt,updatedAt) VALUES ('c1','Olga','DNI','','','611000001','','','VIP',NOW(3),NOW(3)),('c2','Pepe','DNI','','','611000002','','','VIP',NOW(3),NOW(3));
INSERT INTO Brand (id,name,sortOrder,createdAt,updatedAt) VALUES ('b1','Apple',0,NOW(3),NOW(3));
INSERT INTO Model (id,brandId,name,sortOrder,createdAt,updatedAt) VALUES ('m1','b1','iPhone 13',0,NOW(3),NOW(3));
INSERT INTO Service (id,defaultName,category,zh,es,price,sortOrder,createdAt,updatedAt) VALUES ('sv1','Pantalla','维修','屏幕','Pantalla',79,0,NOW(3),NOW(3));
INSERT INTO Part (id,defaultName,category,zh,es,price,sortOrder,createdAt,updatedAt) VALUES ('p1','Battery','配件','电池','Bateria',0,0,NOW(3),NOW(3));
INSERT INTO Technician (id,name,phone,email,color,active,sortOrder,createdAt,updatedAt) VALUES ('t1','ming','','','#16a34a',1,0,NOW(3),NOW(3));
INSERT INTO AttributeGroup (id,name,createdAt,updatedAt) VALUES ('g1','颜色',NOW(3),NOW(3));
INSERT INTO Attribute (id,groupId,defaultName,zh,es,sortOrder,createdAt,updatedAt) VALUES ('a1','g1','Black','黑色','Negro',0,NOW(3),NOW(3));
INSERT INTO Repair (id,ticket,clientId,brand,model,properties,imei,issue,internalNote,passwordType,passwordText,passwordPattern,status,repairTime,warrantyStart,technicianId,technicianName,budget,deposit,paymentMethod,discountAmount,costAmount,frontPhoto,backPhoto,signatureDataUrl,signedAt,publicToken,orderType,sourceRepairId,warrantyReason,warrantyDiagnosis,warrantyResolution,warrantyChargeable,statusHistory,notificationLog,searchText,ticketSort,createdAt,updatedAt) VALUES
('r1','1000000001','c1','APPLE','iPhone 13','','','Pantalla','nota interna','','','[]','已取走','2026-08-01 10:00','2026-08-01 12:00','t1','ming',100,20,'cash',10,0,'data:image/png;base64,AAAA','','data:image/png;base64,SIG','','tok-r1','repair','','','','',0,'[]','[]','1000000001 olga pantalla',1000000001,NOW(3),NOW(3)),
('r2','1000000002','c2','APPLE','iPhone 13','','','Garantia','','','','[]','预定','2026-08-02 10:00','','','Historico',0,0,'none',0,0,'','','','','tok-r2','warranty','r1','','','',0,'[]','[]','1000000002 pepe',1000000002,NOW(3),NOW(3));
INSERT INTO RepairItem (id,repairId,name,qty,price,cost,createdAt,updatedAt) VALUES ('i1','r1','Pantalla',1,100,30,NOW(3),NOW(3));
INSERT INTO Payment (id,repairId,amount,method,note,paidAt,createdBy,createdAt,updatedAt) VALUES ('pay1','r1',20,'cash','订金',NOW(3),'',NOW(3),NOW(3));
INSERT INTO BackupSnapshot (id,kind,reason,data,counts,createdBy,createdAt) VALUES ('bk1','auto','每日自动备份','{"clients":[],"repairs":[],"users":[{"id":"u1","username":"ming"}]}','{}','ming',NOW(3));
