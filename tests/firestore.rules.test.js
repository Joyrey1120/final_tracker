"use strict";

const fs=require("node:fs");
const path=require("node:path");
const {test,before,after,beforeEach}=require("node:test");
const assert=require("node:assert/strict");
const {
  assertFails,assertSucceeds,initializeTestEnvironment
}=require("@firebase/rules-unit-testing");
const {collection,doc,getDoc,getDocs,query,where,setDoc,deleteDoc}=require("firebase/firestore");

const projectId="demo-isp-tracker-rules";
const ownerEmail="sagarinojoyrey@gmail.com";
const secondAdminEmail="dictomesagarino@gmail.com";
const collectorEmail="collector@example.test";
let env;
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{rules:fs.readFileSync(path.join(__dirname,"..","firestore.rules"),"utf8")}
  });
});
after(async()=>{await env.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,"staffPublic","collectorUid"),{
      id:"collectorUid",name:"Collector One",role:"collector",active:true,legacyId:"legacy-collector"
    });
    await setDoc(doc(db,"staffPrivate","collectorUid"),{
      email:collectorEmail,mobile:""
    });
    await setDoc(doc(db,"staffInvites",collectorEmail),{
      email:collectorEmail,role:"collector",active:true,name:"Collector One",
      mobile:"",legacyId:"legacy-collector"
    });
    await setDoc(doc(db,"staffPublic","adminUid"),{
      id:"adminUid",name:"Admin Two",role:"admin",active:true,legacyId:"legacy-admin"
    });
    await setDoc(doc(db,"staffPrivate","adminUid"),{
      email:secondAdminEmail,mobile:""
    });
    await setDoc(doc(db,"clients","client1"),{
      id:"client1",name:"Active client",active:true
    });
    await setDoc(doc(db,"clients","inactive"),{
      id:"inactive",name:"Inactive client",active:false
    });
    await setDoc(doc(db,"shifts","shift1"),{
      id:"shift1",userId:"collectorUid",startedAt:"2026-11-06T08:00:00Z",endedAt:null
    });
    await setDoc(doc(db,"shifts","oldShift"),{
      id:"oldShift",userId:"legacy-collector",startedAt:"2026-11-05T08:00:00Z",endedAt:"2026-11-05T12:00:00Z"
    });
    await setDoc(doc(db,"payments","existing"),{
      id:"existing",clientId:"client1",recorderId:"legacy-collector",
      amount:10000,method:"Cash",date:"2026-11-05",shiftId:"oldShift"
    });
    await setDoc(doc(db,"expenses","expense1"),{
      id:"expense1",amount:1000,date:"2026-11-06",description:"Fuel"
    });
    await setDoc(doc(db,"prototypes","isp-tracker"),{clients:[{id:"client1"}]});
  });
});
const collector=()=>env.authenticatedContext("collectorUid",{
  email:collectorEmail,email_verified:true
}).firestore();
const admin=()=>env.authenticatedContext("adminUid",{
  email:secondAdminEmail,email_verified:true
}).firestore();
const unauth=()=>env.unauthenticatedContext().firestore();

test("owner and enrolled second admin can access legacy data; collectors cannot",async()=>{
  const owner=env.authenticatedContext("ownerUid",{
    email:ownerEmail,email_verified:true
  }).firestore();
  await assertSucceeds(getDoc(doc(owner,"prototypes","isp-tracker")));
  await assertSucceeds(getDoc(doc(admin(),"prototypes","isp-tracker")));
  await assertFails(getDoc(doc(collector(),"prototypes","isp-tracker")));
  await assertFails(getDoc(doc(unauth(),"prototypes","isp-tracker")));
});

test("collectors can read tracker data but cannot modify clients, invoices, or expenses",async()=>{
  const db=collector();
  await assertSucceeds(getDoc(doc(db,"clients","client1")));
  await assertSucceeds(getDocs(collection(db,"clients")));
  await assertSucceeds(getDoc(doc(db,"expenses","expense1")));
  await assertFails(setDoc(doc(db,"clients","client2"),{id:"client2",name:"No"}));
  await assertFails(deleteDoc(doc(db,"expenses","expense1")));
  await assertFails(setDoc(doc(db,"expenses","expense2"),{id:"expense2",amount:100}));
});

test("collectors may create payments only for active clients and their active shift",async()=>{
  const db=collector();
  await assertSucceeds(setDoc(doc(db,"payments","newPayment"),{
    id:"newPayment",clientId:"client1",recorderId:"collectorUid",
    amount:25000,method:"Cash",date:"2026-11-06",shiftId:"shift1"
  }));
  await assertFails(setDoc(doc(db,"payments","inactivePayment"),{
    id:"inactivePayment",clientId:"inactive",recorderId:"collectorUid",
    amount:25000,method:"Cash",date:"2026-11-06",shiftId:"shift1"
  }));
  await assertFails(setDoc(doc(db,"payments","noShift"),{
    id:"noShift",clientId:"client1",recorderId:"collectorUid",
    amount:25000,method:"Cash",date:"2026-11-06",shiftId:"missing"
  }));
  await assertFails(deleteDoc(doc(db,"payments","existing")));
  await assertFails(setDoc(doc(db,"reversals","reverse"),{
    id:"reverse",paymentId:"existing",actorEmail:collectorEmail
  }));
});

test("cash records are limited to the collector's own UID and preserved legacy ID",async()=>{
  const db=collector();
  const own=query(collection(db,"shifts"),where("userId","in",["collectorUid","legacy-collector"]));
  await assertSucceeds(getDocs(own));
  await assertSucceeds(getDoc(doc(db,"shifts","oldShift")));
  await assertFails(getDoc(doc(db,"shifts","otherShift")));
  await assertSucceeds(setDoc(doc(db,"handovers","handover1"),{
    id:"handover1",collectorId:"collectorUid",amount:5000,
    status:"Pending",shiftId:"shift1",date:"2026-11-06"
  }));
  await assertFails(setDoc(doc(db,"handovers","fakeOwner"),{
    id:"fakeOwner",collectorId:"otherUid",amount:5000,
    status:"Pending",shiftId:"shift1",date:"2026-11-06"
  }));
});

test("collectors cannot promote themselves; admins can manage clients and expenses",async()=>{
  await assertFails(setDoc(doc(collector(),"staffPublic","collectorUid"),{
    id:"collectorUid",name:"Collector One",role:"admin",active:true,legacyId:"legacy-collector"
  }));
  await assertSucceeds(setDoc(doc(admin(),"clients","client2"),{
    id:"client2",name:"Admin-created",active:true
  }));
  await assertSucceeds(deleteDoc(doc(admin(),"expenses","expense1")));
});

test("a verified invited collector can claim a UID-bound profile but cannot claim an uninvited role",async()=>{
  const db=env.authenticatedContext("newCollectorUid",{
    email:"newcollector@example.test",email_verified:true
  }).firestore();
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),"staffInvites","newcollector@example.test"),{
      email:"newcollector@example.test",role:"collector",active:true,
      name:"New Collector",mobile:"",legacyId:"legacy-new"
    });
  });
  await assertSucceeds(setDoc(doc(db,"staffPublic","newCollectorUid"),{
    id:"newCollectorUid",name:"New Collector",role:"collector",
    active:true,legacyId:"legacy-new"
  }));
  await assertFails(setDoc(doc(db,"staffPublic","newCollectorUid"),{
    id:"newCollectorUid",name:"New Collector",role:"admin",
    active:true,legacyId:"legacy-new"
  }));
});
