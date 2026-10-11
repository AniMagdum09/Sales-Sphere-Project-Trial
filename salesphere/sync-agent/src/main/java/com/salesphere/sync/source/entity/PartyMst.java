package com.salesphere.sync.source.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * SOURCE: customer / party master (66 columns in the billing DB; only the columns
 * needed for analytics are mapped). READ-ONLY, never written by SalesSphere.
 */
@Entity
@Table(name = "PartyMst")
@Immutable
public class PartyMst {

    @Id
    @Column(name = "party_no", length = 7)
    private String partyNo;

    @Column(name = "party_code", length = 7)
    private String partyCode;

    @Column(name = "party_name", length = 100)
    private String partyName;

    @Column(name = "party_add")
    private String address;

    @Column(name = "party_tel", length = 50)
    private String phone;

    @Column(name = "Credit_Limit")
    private BigDecimal creditLimit;

    @Column(name = "Contact_Person", length = 100)
    private String contactPerson;

    @Column(name = "party_category", length = 50)
    private String category;

    @Column(name = "party_city", length = 50)
    private String city;

    @Column(name = "party_state", length = 50)
    private String state;

    @Column(name = "Opening_Balance")
    private BigDecimal openingBalance;

    @Column(name = "MembershipID", length = 50)
    private String membershipId;

    @Column(name = "Branch_Code", length = 2)
    private String branchCode;

    @Column(name = "Doc_Date")
    private LocalDateTime docDate;

    @Column(name = "Mod_Date")
    private LocalDateTime modDate;

    public String getPartyNo() { return partyNo; }

    public String getPartyName() { return partyName; }

    public String getAddress() { return address; }

    public String getPhone() { return phone; }

    public BigDecimal getCreditLimit() { return creditLimit; }

    public String getContactPerson() { return contactPerson; }

    public String getCategory() { return category; }

    public String getCity() { return city; }

    public String getState() { return state; }

    public BigDecimal getOpeningBalance() { return openingBalance; }

    public String getMembershipId() { return membershipId; }

    public String getBranchCode() { return branchCode; }

    public LocalDateTime getDocDate() { return docDate; }

    public LocalDateTime getModDate() { return modDate; }
}
